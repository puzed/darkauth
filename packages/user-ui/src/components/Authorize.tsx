import { useCallback, useEffect, useId, useState } from "react";
import apiService from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
import opaqueService from "../services/opaque";
import { loadExportKey } from "../services/sessionKey";

//

interface ScopeInfo {
  scope: string;
  description: string;
  icon: string;
}

const SCOPE_DESCRIPTIONS: Record<string, ScopeInfo> = {
  openid: {
    scope: "openid",
    description: "Basic identity information",
    icon: "👤",
  },
  profile: {
    scope: "profile",
    description: "Full name and profile information",
    icon: "📋",
  },
  email: {
    scope: "email",
    description: "Email address",
    icon: "📧",
  },
  offline_access: {
    scope: "offline_access",
    description: "Persistent access to your data",
    icon: "🔄",
  },
};

interface AuthorizeProps {
  authRequest: {
    requestId: string;
    clientName: string;
    scopes: string[];
    hasZk: boolean;
  };
  sessionData: { sub: string; name?: string; email?: string };
  onRecoverWithOldPassword?: () => void;
}

export default function Authorize({
  authRequest,
  sessionData,
  onRecoverWithOldPassword: _onRecoverWithOldPassword,
}: AuthorizeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [_zkKeyPair, setZkKeyPair] = useState<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  } | null>(null);
  const oldPasswordId = useId();

  const generateZkKeyPair = useCallback(async () => {
    try {
      const keyPair = await cryptoService.generateECDHKeyPair();
      setZkKeyPair(keyPair);
    } catch (error) {
      console.error("Failed to generate ZK key pair:", error);
      setError("Failed to initialize zero-knowledge delivery");
    }
  }, []);

  useEffect(() => {
    // Generate ZK key pair if this client supports ZK delivery
    if (authRequest.hasZk) {
      generateZkKeyPair();
    }
  }, [authRequest.hasZk, generateZkKeyPair]);

  const getScopeInfo = (scope: string): ScopeInfo => {
    return (
      SCOPE_DESCRIPTIONS[scope] || {
        scope,
        description: scope,
        icon: "🔐",
      }
    );
  };

  const handleAuthorize = async (approve: boolean) => {
    console.log("[Authorize] handleAuthorize called", { approve, hasZk: authRequest.hasZk });
    setLoading(true);
    setError(null);

    try {
      if (approve && authRequest.hasZk) {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";

        if (zkPubParam && clientId) {
          try {
            console.log("[Authorize] ZK flow start", {
              requestId: authRequest.requestId,
              clientId,
            });
            const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
            const wrappedDrkB64 = await apiService.getWrappedDrk();
            console.log("[Authorize] got wrapped DRK", { len: wrappedDrkB64?.length || 0 });
            const wrappedDrk = fromBase64Url(wrappedDrkB64);
            const exportKey = loadExportKey(sessionData.sub);
            if (!exportKey) throw new Error("Missing export key");
            const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
            const drk = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
            const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
            console.log("[Authorize] created JWE", { size: jwe.length });
            const drkHash = await sha256Base64Url(jwe);
            console.log("[Authorize] calling finalize");
            const authResponse = await apiService.authorize({
              requestId: authRequest.requestId,
              approve,
              drkHash,
              drkJwe: jwe,
            });
            console.log("[Authorize] finalize ok, redirecting", authResponse);
            window.location.href = authResponse.redirectUrl;
            return;
          } catch (e) {
            console.error("ZK delivery failed:", e);
            setError(
              e instanceof Error ? e.message : "Zero‑knowledge delivery failed. Please retry."
            );
            setRecoveryVisible(true);
            return;
          }
        }
      }

      console.log("[Authorize] calling finalize (non-ZK)");
      const authResponse = await apiService.authorize({
        requestId: authRequest.requestId,
        approve,
      });
      console.log("[Authorize] finalize ok (non-ZK), redirecting", authResponse);
      window.location.href = authResponse.redirectUrl;
    } catch (error) {
      console.error("Authorization failed:", error);

      let errorMessage = "Authorization failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("expired")) {
          errorMessage = "Authorization request has expired. Please restart the login process.";
        } else if (error.message.includes("invalid")) {
          errorMessage = "Invalid authorization request. Please restart the login process.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = error.message;
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log("[Authorize] handleAuthorize finished");
    }
  };

  const generateNewKeys = async () => {
    console.log("[Authorize] generateNewKeys start");
    if (!sessionData.email) {
      setError("Email is required to initialize keys");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    try {
      console.log("[Authorize] generateNewKeys deriving keys");
      const exportKey = loadExportKey(sessionData.sub);
      if (!exportKey) {
        throw new Error("Missing export key. Please sign out and sign back in to initialize keys.");
      }
      const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      console.log("[Authorize] generateNewKeys keys derived");
      const drk = await cryptoService.generateDRK();
      const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sessionData.sub);
      console.log("[Authorize] generateNewKeys put wrapped-drk");
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
      try {
        const kp = await cryptoService.generateECDHKeyPair();
        const pub = await cryptoService.exportPublicKeyJWK(kp.publicKey);
        console.log("[Authorize] generateNewKeys publish enc pub");
        await apiService.putEncPublicJwk(pub);
        const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
        const wrappedPriv = await cryptoService.wrapEncPrivateJwkWithDrk(privJwk, drk);
        console.log("[Authorize] generateNewKeys put wrapped enc priv");
        await apiService.putWrappedEncPrivateJwk(wrappedPriv);
        cryptoService.clearSensitiveData(drk);
      } catch {}
      console.log("[Authorize] generateNewKeys success. About to finalize");
      setRecoveryVisible(false);
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
          const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
          const drkHash = await sha256Base64Url(jwe);
          console.log("[Authorize] finalize directly after generateNewKeys");
          const authResponse = await apiService.authorize({
            requestId: authRequest.requestId,
            approve: true,
            drkHash,
            drkJwe: jwe,
          });
          window.location.href = authResponse.redirectUrl;
          return;
        }
      } catch (e) {
        console.warn("[Authorize] direct finalize after generateNewKeys failed; falling back", e);
      }
      queueMicrotask(() => {
        console.log("[Authorize] microtask finalize after generateNewKeys");
        handleAuthorize(true);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize new keys");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const recoverWithOldPassword = async () => {
    console.log("[Authorize] recoverWithOldPassword start");
    if (!sessionData.email) {
      setError("Email is required for recovery");
      return;
    }
    if (!oldPassword) {
      setError("Enter your old password");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    try {
      console.log("[Authorize] recoverWithOldPassword OPAQUE start");
      const oldStart = await opaqueService.startLogin(sessionData.email, oldPassword);
      const oldStartResp = await apiService.passwordVerifyStart(oldStart.request);
      console.log("[Authorize] recoverWithOldPassword OPAQUE finish");
      const oldFinish = await opaqueService.finishLogin(oldStartResp.message, oldStart.state);
      opaqueService.clearState(oldStart.state);
      const currentExportKey = loadExportKey(sessionData.sub);
      if (!currentExportKey) {
        throw new Error(
          "Current key material is not loaded. Please sign out and sign in to load your key, then retry recovery."
        );
      }

      console.log("[Authorize] recoverWithOldPassword fetch wrapped-drk");
      const wrappedDrkB64 = await apiService.getWrappedDrk();
      const wrapped = fromBase64Url(wrappedDrkB64);
      console.log("[Authorize] recoverWithOldPassword unwrap old");
      const keysOld = await cryptoService.deriveKeysFromExportKey(
        oldFinish.exportKey,
        sessionData.sub
      );
      const drk = await cryptoService.unwrapDRK(wrapped, keysOld.wrapKey, sessionData.sub);
      console.log("[Authorize] recoverWithOldPassword rewrap new");
      const keysNew = await cryptoService.deriveKeysFromExportKey(
        currentExportKey,
        sessionData.sub
      );
      const rewrapped = await cryptoService.wrapDRK(drk, keysNew.wrapKey, sessionData.sub);
      console.log("[Authorize] recoverWithOldPassword put wrapped-drk");
      await apiService.putWrappedDrk(toBase64Url(rewrapped));
      console.log("[Authorize] recovery success. About to finalize");
      setRecoveryVisible(false);
      setOldPassword("");
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
          const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
          const drkHash = await sha256Base64Url(jwe);
          console.log("[Authorize] finalize directly after recovery");
          const authResponse = await apiService.authorize({
            requestId: authRequest.requestId,
            approve: true,
            drkHash,
            drkJwe: jwe,
          });
          window.location.href = authResponse.redirectUrl;
          return;
        }
      } catch (e) {
        console.warn("[Authorize] direct finalize after recovery failed; falling back", e);
      }
      queueMicrotask(() => {
        console.log("[Authorize] microtask finalize after recovery");
        handleAuthorize(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Recovery failed";
      setError(
        msg.includes("auth") || msg.includes("OPAQUE") ? "Old password verification failed" : msg
      );
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="authorize-container">
      <div className="authorize-card">
        <div className="client-info">
          <div className="client-icon">🏢</div>
          <h2>Authorization Request</h2>
          <p className="client-name">
            <strong>{authRequest.clientName}</strong> wants to access your account
          </p>
        </div>

        <div className="user-info">
          <div className="user-avatar">👤</div>
          <div className="user-details">
            <p className="user-name">{sessionData.name || sessionData.email}</p>
            {sessionData.email && sessionData.name && (
              <p className="user-email">{sessionData.email}</p>
            )}
          </div>
        </div>

        <div className="permissions-section">
          <h3>Requested Permissions</h3>
          <div className="permissions-list">
            {authRequest.scopes.map((scope) => {
              const scopeInfo = getScopeInfo(scope);
              return (
                <div key={scope} className="permission-item">
                  <span className="permission-icon">{scopeInfo.icon}</span>
                  <div className="permission-details">
                    <span className="permission-name">{scopeInfo.scope}</span>
                    <span className="permission-description">{scopeInfo.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {authRequest.hasZk && (
          <div className="zk-section">
            <div className="zk-indicator">
              <span className="zk-icon">🔐</span>
              <div className="zk-info">
                <h4>Zero-Knowledge Delivery</h4>
                <p>
                  Your data will be delivered using zero-knowledge encryption for enhanced privacy
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {recoveryVisible && (
          <div className="client-info" style={{ marginTop: "1rem" }}>
            <h3>Key Recovery</h3>
            <p>
              We couldn’t access your encryption keys. If you recently changed your password, you
              can either try to migrate using your previous password or generate new keys.
            </p>
            <div className="form-group">
              <label htmlFor={oldPasswordId}>Old Password</label>
              <input
                id={oldPasswordId}
                type="password"
                placeholder="Enter your old password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="deny-button"
                onClick={recoverWithOldPassword}
                disabled={recoveryLoading}
              >
                Recover with old password
              </button>
              <button
                type="button"
                className="approve-button"
                onClick={generateNewKeys}
                disabled={recoveryLoading}
              >
                {recoveryLoading ? (
                  <>
                    <span className="loading-spinner" />
                    Initializing...
                  </>
                ) : (
                  "Generate New Keys"
                )}
              </button>
            </div>
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className="deny-button"
            onClick={() => handleAuthorize(false)}
            disabled={loading}
          >
            {loading ? "Processing..." : "Deny"}
          </button>

          <button
            type="button"
            className="approve-button"
            onClick={() => handleAuthorize(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner" />
                Authorizing...
              </>
            ) : (
              "Authorize"
            )}
          </button>
        </div>

        <div className="privacy-notice">
          <p>
            By clicking "Authorize", you allow {authRequest.clientName} to access the requested
            information. You can revoke this access at any time in your account settings.
          </p>
        </div>
      </div>
    </div>
  );
}
