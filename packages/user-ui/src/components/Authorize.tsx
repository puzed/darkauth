import { useCallback, useEffect, useId, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
import { clearDrk, loadDrk, saveDrk } from "../services/drkStorage";
import { logger } from "../services/logger";
import opaqueService from "../services/opaque";
import { loadExportKey, saveExportKey } from "../services/sessionKey";
import Button from "./Button";

interface ScopeInfo {
  scope: string;
  description: string;
  icon: string;
  textKey?: string;
}

const SCOPE_DESCRIPTIONS: Record<string, ScopeInfo> = {
  openid: {
    scope: "openid",
    description: "Authenticate you",
    icon: "👤",
    textKey: "scopeOpenid",
  },
  profile: {
    scope: "profile",
    description: "Access your profile information",
    icon: "📋",
    textKey: "scopeProfile",
  },
  email: {
    scope: "email",
    description: "Access your email address",
    icon: "📧",
    textKey: "scopeEmail",
  },
  offline_access: {
    scope: "offline_access",
    description: "Maintain access when you are offline",
    icon: "🔄",
    textKey: "scopeOffline",
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
  const branding = useBranding();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [_zkKeyPair, setZkKeyPair] = useState<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  } | null>(null);
  const currentPasswordId = useId();
  const oldPasswordId = useId();
  const appName = authRequest.clientName || "Application";

  const generateZkKeyPair = useCallback(async () => {
    try {
      const keyPair = await cryptoService.generateECDHKeyPair();
      setZkKeyPair(keyPair);
    } catch (error) {
      logger.error(error, "Failed to generate ZK key pair");
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
    const info = SCOPE_DESCRIPTIONS[scope];
    if (info) {
      return {
        ...info,
        description: info.textKey
          ? branding.getText(info.textKey, info.description)
          : info.description,
      };
    }
    return {
      scope,
      description: `Access your ${scope} information`,
      icon: "🔐",
    };
  };

  const interpolateText = (text: string, values: Record<string, string>) => {
    return text.replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
  };

  const authorizeTitle = interpolateText(branding.getText("authorizeTitle", "Authorize {app}"), {
    app: appName,
  });
  const authorizeDescription = interpolateText(
    branding.getText("authorizeDescription", "{app} would like to:"),
    { app: appName }
  );
  const signedInAs = branding.getText("signedInAs", "Signed in as");

  const handleAuthorize = async (approve: boolean) => {
    setLoading(true);
    setError(null);

    try {
      if (approve && authRequest.hasZk) {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";

        if (zkPubParam && clientId) {
          try {
            const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
            const wrappedDrkB64 = await apiService.getWrappedDrk();
            const wrappedDrk = fromBase64Url(wrappedDrkB64);
            const wrappedDrkHash = await sha256Base64Url(wrappedDrk);
            const exportKey = await loadExportKey(sessionData.sub);
            if (!exportKey) {
              const stored = loadDrk(sessionData.sub);
              if (!stored || stored.wrappedDrkHash !== wrappedDrkHash) {
                clearDrk(sessionData.sub);
                throw new Error("Missing export key");
              }
              const jwe = await cryptoService.createDrkJWE(
                stored.drk,
                zkPubJwk,
                sessionData.sub,
                clientId
              );
              const drkHash = await sha256Base64Url(jwe);
              const authResponse = await apiService.authorize({
                requestId: authRequest.requestId,
                approve,
                drkHash,
              });
              const redirectUrl = new URL(authResponse.redirectUrl);
              redirectUrl.hash = `drk_jwe=${encodeURIComponent(jwe)}`;
              window.location.href = redirectUrl.toString();
              return;
            }
            const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
            const drk = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
            const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
            saveDrk(sessionData.sub, drk, wrappedDrkHash);

            // Clear sensitive data immediately
            cryptoService.clearSensitiveData(
              exportKey,
              keys.masterKey,
              keys.wrapKey,
              keys.deriveKey,
              drk
            );
            const drkHash = await sha256Base64Url(jwe);

            const authResponse = await apiService.authorize({
              requestId: authRequest.requestId,
              approve,
              drkHash,
            });

            // Add the JWE to the fragment (this is how it gets to the app without server seeing it)
            const redirectUrl = new URL(authResponse.redirectUrl);
            redirectUrl.hash = `drk_jwe=${encodeURIComponent(jwe)}`;
            window.location.href = redirectUrl.toString();
            return;
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Zero-knowledge delivery failed. Please retry."
            );
            setRecoveryVisible(true);
            return;
          }
        }
      }

      const authResponse = await apiService.authorize({
        requestId: authRequest.requestId,
        approve,
      });
      logger.info({ response: authResponse }, "[Authorize] finalize without ZK");
      window.location.href = authResponse.redirectUrl;
    } catch (error) {
      logger.error(error, "Authorization failed");

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
      logger.debug(
        { requestId: authRequest.requestId, approve },
        "[Authorize] handleAuthorize finished"
      );
    }
  };

  const generateNewKeys = async () => {
    logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys start");
    if (!sessionData.email) {
      setError("Email is required to initialize keys");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    try {
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys deriving keys");
      const exportKey = await loadExportKey(sessionData.sub);
      if (!exportKey) {
        throw new Error("Missing export key. Please sign out and sign back in to initialize keys.");
      }
      const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);

      // Clear export key from memory immediately after deriving other keys
      cryptoService.clearSensitiveData(exportKey);
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys keys derived");
      const drk = await cryptoService.generateDRK();
      const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sessionData.sub);
      const wrappedDrkHash = await sha256Base64Url(wrappedDrk);
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys storing wrapped DRK");
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
      saveDrk(sessionData.sub, drk, wrappedDrkHash);
      try {
        const kp = await cryptoService.generateECDHKeyPair();
        const pub = await cryptoService.exportPublicKeyJWK(kp.publicKey);
        logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys publish enc pub");
        await apiService.putEncPublicJwk(pub);
        const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
        const wrappedPriv = await cryptoService.wrapEncPrivateJwkWithDrk(privJwk, drk);
        logger.debug(
          { sub: sessionData.sub },
          "[Authorize] generateNewKeys store wrapped enc priv"
        );
        await apiService.putWrappedEncPrivateJwk(wrappedPriv);
      } catch (err) {
        logger.warn(
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { detail: String(err) },
          "Failed to refresh encryption keys"
        );
      }
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys success");
      setRecoveryVisible(false);
      cryptoService.clearSensitiveData(drk);
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
          const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
          const drkHash = await sha256Base64Url(jwe);
          logger.debug(
            { requestId: authRequest.requestId },
            "[Authorize] finalize immediately after generateNewKeys"
          );
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
        logger.warn(
          e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack }
            : { detail: String(e) },
          "[Authorize] immediate finalize after generateNewKeys failed"
        );
      }
      queueMicrotask(() => {
        logger.debug(
          { requestId: authRequest.requestId },
          "[Authorize] microtask finalize after generateNewKeys"
        );
        handleAuthorize(true);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize new keys");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const recoverWithOldPassword = async () => {
    logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword start");
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
      let currentExportKey = await loadExportKey(sessionData.sub);
      if (!currentExportKey) {
        if (!currentPassword) {
          throw new Error("Enter your current password to unlock keys.");
        }
        const currentStart = await opaqueService.startLogin(sessionData.email, currentPassword);
        const currentStartResp = await apiService.passwordVerifyStart(currentStart.request);
        const currentFinish = await opaqueService.finishLogin(
          currentStartResp.message,
          currentStart.state
        );
        opaqueService.clearState(currentStart.state);
        currentExportKey = currentFinish.exportKey;
        await saveExportKey(sessionData.sub, currentExportKey);
        cryptoService.clearSensitiveData(currentFinish.sessionKey);
      }

      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword OPAQUE start");
      const oldStart = await opaqueService.startLogin(sessionData.email, oldPassword);
      const oldStartResp = await apiService.passwordRecoveryVerifyStart(oldStart.request);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword OPAQUE finish");
      const oldFinish = await opaqueService.finishLogin(oldStartResp.message, oldStart.state);
      await apiService.passwordRecoveryVerifyFinish(oldFinish.request, oldStartResp.sessionId);
      opaqueService.clearState(oldStart.state);

      logger.debug(
        { sub: sessionData.sub },
        "[Authorize] recoverWithOldPassword fetch wrapped DRK"
      );
      const wrappedDrkB64 = await apiService.getWrappedDrk();
      const wrapped = fromBase64Url(wrappedDrkB64);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword unwrap old DRK");
      const keysOld = await cryptoService.deriveKeysFromExportKey(
        oldFinish.exportKey,
        sessionData.sub
      );
      const drk = await cryptoService.unwrapDRK(wrapped, keysOld.wrapKey, sessionData.sub);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword rewrap new DRK");
      const keysNew = await cryptoService.deriveKeysFromExportKey(
        currentExportKey,
        sessionData.sub
      );
      const rewrapped = await cryptoService.wrapDRK(drk, keysNew.wrapKey, sessionData.sub);
      const wrappedDrkHash = await sha256Base64Url(rewrapped);
      logger.debug(
        { sub: sessionData.sub },
        "[Authorize] recoverWithOldPassword store wrapped DRK"
      );
      await apiService.putWrappedDrk(toBase64Url(rewrapped));
      saveDrk(sessionData.sub, drk, wrappedDrkHash);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recovery success");
      setRecoveryVisible(false);
      setOldPassword("");
      setCurrentPassword("");
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
          const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);
          const drkHash = await sha256Base64Url(jwe);
          logger.debug(
            { requestId: authRequest.requestId },
            "[Authorize] finalize immediately after recovery"
          );
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
        logger.warn(
          e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack }
            : { detail: String(e) },
          "[Authorize] immediate finalize after recovery failed"
        );
      }
      queueMicrotask(() => {
        logger.debug(
          { requestId: authRequest.requestId },
          "[Authorize] microtask finalize after recovery"
        );
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
    <div className="authorize-container da-authorize-container">
      <div className="authorize-card da-container">
        <div className="authorize-header">
          <div className="authorize-app">
            <div className="authorize-app-icon">🏢</div>
            <div className="authorize-app-text">
              <h2 className="authorize-title da-auth-title">{authorizeTitle}</h2>
              <p className="authorize-description">{authorizeDescription}</p>
            </div>
          </div>
          <div className="authorize-account">
            <div className="authorize-avatar">👤</div>
            <div className="authorize-account-text">
              <p className="authorize-account-label">{signedInAs}</p>
              <p className="authorize-account-name">{sessionData.name || sessionData.email}</p>
              {sessionData.email && sessionData.name && (
                <p className="authorize-account-email">{sessionData.email}</p>
              )}
            </div>
          </div>
        </div>

        <div className="authorize-scopes da-authorize-scopes">
          <h3>Permissions</h3>
          {authRequest.scopes.length === 0 ? (
            <p className="authorize-empty">No additional permissions requested.</p>
          ) : (
            <ul className="authorize-scope-list">
              {authRequest.scopes.map((scope) => {
                const scopeInfo = getScopeInfo(scope);
                return (
                  <li key={scope} className="authorize-scope-item da-authorize-scope">
                    <span className="authorize-scope-icon">{scopeInfo.icon}</span>
                    <div className="authorize-scope-text">
                      <span className="authorize-scope-name">{scopeInfo.scope}</span>
                      <span className="authorize-scope-description">{scopeInfo.description}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {authRequest.hasZk && (
          <div className="authorize-flag">
            <span className="authorize-flag-icon">🔐</span>
            <div className="authorize-flag-text">
              <h4>Zero-Knowledge Delivery</h4>
              <p>Encryption keys are delivered directly to the app.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message da-error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {recoveryVisible && (
          <div className="authorize-recovery">
            <h3>Key Recovery</h3>
            <p>
              We couldn’t access your encryption keys. If you recently changed your password, you
              can either try to migrate using your previous password or generate new keys.
            </p>
            <div className="form-group">
              <label htmlFor={currentPasswordId}>Current Password</label>
              <input
                id={currentPasswordId}
                type="password"
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
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
            <div className="actions da-authorize-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={recoverWithOldPassword}
                disabled={recoveryLoading}
              >
                Recover with old password
              </Button>
              <Button
                type="button"
                variant="success"
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
              </Button>
            </div>
          </div>
        )}

        <div className="actions da-authorize-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleAuthorize(false)}
            disabled={loading}
          >
            {loading
              ? branding.getText("processing", "Processing...")
              : branding.getText("deny", "Deny")}
          </Button>

          <Button
            type="button"
            variant="success"
            onClick={() => handleAuthorize(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner" />
                {branding.getText("authorizing", "Authorizing...")}
              </>
            ) : (
              branding.getText("authorize", "Authorize")
            )}
          </Button>
        </div>

        <div className="authorize-footnote">
          <p>
            By clicking "Authorize", you allow {authRequest.clientName} to access the requested
            information. You can revoke this access at any time in your account settings.
          </p>
        </div>
      </div>
    </div>
  );
}
