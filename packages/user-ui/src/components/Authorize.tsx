import { useCallback, useEffect, useId, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService, { type UserOrganization } from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
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
    scopeDescriptions?: Record<string, string>;
    hasZk: boolean;
    organizationId?: string;
  };
  sessionData: {
    sub: string;
    name?: string;
    email?: string;
    organizationId?: string;
    organizationSlug?: string;
  };
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
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    authRequest.organizationId || sessionData.organizationId || ""
  );
  const [_zkKeyPair, setZkKeyPair] = useState<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  } | null>(null);
  const currentPasswordId = useId();
  const oldPasswordId = useId();
  const appName = authRequest.clientName || "Application";
  const explicitOrganizationId = authRequest.organizationId || "";
  const sessionOrganizationId = sessionData.organizationId || "";
  const hasZkDeliveryScope =
    authRequest.hasZk && new URL(window.location.href).searchParams.has("zk_pub");
  const activeOrganizations = organizations.filter((organization) =>
    organization.status ? organization.status === "active" : true
  );
  const selectedOrganization = activeOrganizations.find(
    (organization) => organization.organizationId === selectedOrganizationId
  );
  const noActiveOrganizations = !organizationsLoading && activeOrganizations.length === 0;
  const selectedOrganizationLocked = !!explicitOrganizationId;
  const showOrganizationSummary =
    activeOrganizations.length === 1 ||
    selectedOrganizationLocked ||
    (!!sessionOrganizationId && selectedOrganization?.organizationId === sessionOrganizationId);

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
    if (authRequest.hasZk) {
      generateZkKeyPair();
    }
  }, [authRequest.hasZk, generateZkKeyPair]);

  useEffect(() => {
    let cancelled = false;
    setOrganizationsLoading(true);
    apiService
      .getOrganizations()
      .then((response) => {
        if (cancelled) return;
        const nextOrganizations = response.organizations || [];
        setOrganizations(nextOrganizations);
        const nextActiveOrganizations = nextOrganizations.filter((organization) =>
          organization.status ? organization.status === "active" : true
        );
        setSelectedOrganizationId((current) => {
          if (explicitOrganizationId) return explicitOrganizationId;
          if (current && nextActiveOrganizations.some((org) => org.organizationId === current)) {
            return current;
          }
          if (
            sessionOrganizationId &&
            nextActiveOrganizations.some((org) => org.organizationId === sessionOrganizationId)
          ) {
            return sessionOrganizationId;
          }
          return nextActiveOrganizations.length === 1
            ? nextActiveOrganizations[0].organizationId
            : "";
        });
      })
      .catch((error) => {
        logger.warn(error, "Failed to load organizations for authorization");
        if (!cancelled) {
          setError("Unable to load your organizations. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setOrganizationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [explicitOrganizationId, sessionOrganizationId]);

  const getScopeInfo = (scope: string): ScopeInfo => {
    const info = SCOPE_DESCRIPTIONS[scope];
    if (info) {
      const customDescription = authRequest.scopeDescriptions?.[scope];
      return {
        ...info,
        description:
          customDescription ||
          (info.textKey ? branding.getText(info.textKey, info.description) : info.description),
      };
    }
    const customDescription = authRequest.scopeDescriptions?.[scope];
    return {
      scope,
      description: customDescription || `Access your ${scope} information`,
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
    if (approve && noActiveOrganizations) {
      setError("Your account is not a member of any active organization.");
      return;
    }
    if (approve && activeOrganizations.length > 1 && !selectedOrganizationId) {
      setError("Choose which organization to use for this sign-in.");
      return;
    }

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
            const exportKey = await loadExportKey(sessionData.sub);
            if (!exportKey) {
              throw new Error("Missing export key");
            }
            const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
            const drk = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
            const jwe = await cryptoService.createDrkJWE(drk, zkPubJwk, sessionData.sub, clientId);

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
              organizationId: selectedOrganizationId || undefined,
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
        organizationId: selectedOrganizationId || undefined,
      });
      logger.info({ requestId: authRequest.requestId, approve }, "[Authorize] finalize without ZK");
      window.location.href = authResponse.redirectUrl;
    } catch (error) {
      logger.error(error, "Authorization failed");

      let errorMessage = "Authorization failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("expired")) {
          errorMessage = "Authorization request has expired. Please restart the login process.";
        } else if (explicitOrganizationId && error.message.toLowerCase().includes("organization")) {
          errorMessage = "Your account cannot sign in with the selected organization.";
        } else if (error.message.includes("invalid")) {
          errorMessage = "Invalid authorization request. Please restart the login process.";
        } else if (
          "code" in error &&
          (error as Error & { code?: string }).code === "ORG_CONTEXT_REQUIRED"
        ) {
          errorMessage = "Choose which organization to use for this sign-in.";
        } else if (error.message.includes("ORG_CONTEXT_REQUIRED")) {
          errorMessage = "Choose which organization to use for this sign-in.";
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
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys storing wrapped DRK");
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
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
      const drkForHandoff = drk.slice();
      cryptoService.clearSensitiveData(drk);
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
          const jwe = await cryptoService.createDrkJWE(
            drkForHandoff,
            zkPubJwk,
            sessionData.sub,
            clientId
          );
          const drkHash = await sha256Base64Url(jwe);
          logger.debug(
            { requestId: authRequest.requestId },
            "[Authorize] finalize immediately after generateNewKeys"
          );
          const authResponse = await apiService.authorize({
            requestId: authRequest.requestId,
            approve: true,
            drkHash,
            organizationId: selectedOrganizationId || undefined,
          });
          const redirectUrl = new URL(authResponse.redirectUrl);
          redirectUrl.hash = `drk_jwe=${encodeURIComponent(jwe)}`;
          cryptoService.clearSensitiveData(drkForHandoff);
          window.location.href = redirectUrl.toString();
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
      cryptoService.clearSensitiveData(drkForHandoff);
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
    let currentExportKey: Uint8Array | null = null;
    let oldExportKey: Uint8Array | null = null;
    let recoveredDrk: Uint8Array | null = null;
    let keysOld: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    let keysNew: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    try {
      currentExportKey = await loadExportKey(sessionData.sub);
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
      oldExportKey = oldFinish.exportKey;
      cryptoService.clearSensitiveData(oldFinish.sessionKey);

      logger.debug(
        { sub: sessionData.sub },
        "[Authorize] recoverWithOldPassword fetch wrapped DRK"
      );
      const wrappedDrkB64 = await apiService.getWrappedDrk();
      const wrapped = fromBase64Url(wrappedDrkB64);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword unwrap old DRK");
      keysOld = await cryptoService.deriveKeysFromExportKey(oldExportKey, sessionData.sub);
      recoveredDrk = await cryptoService.unwrapDRK(wrapped, keysOld.wrapKey, sessionData.sub);
      logger.debug({ sub: sessionData.sub }, "[Authorize] recoverWithOldPassword rewrap new DRK");
      keysNew = await cryptoService.deriveKeysFromExportKey(currentExportKey, sessionData.sub);
      const rewrapped = await cryptoService.wrapDRK(recoveredDrk, keysNew.wrapKey, sessionData.sub);
      logger.debug(
        { sub: sessionData.sub },
        "[Authorize] recoverWithOldPassword store wrapped DRK"
      );
      await apiService.putWrappedDrk(toBase64Url(rewrapped));
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
          const jwe = await cryptoService.createDrkJWE(
            recoveredDrk,
            zkPubJwk,
            sessionData.sub,
            clientId
          );
          const drkHash = await sha256Base64Url(jwe);
          logger.debug(
            { requestId: authRequest.requestId },
            "[Authorize] finalize immediately after recovery"
          );
          const authResponse = await apiService.authorize({
            requestId: authRequest.requestId,
            approve: true,
            drkHash,
            organizationId: selectedOrganizationId || undefined,
          });
          const redirectUrl = new URL(authResponse.redirectUrl);
          redirectUrl.hash = `drk_jwe=${encodeURIComponent(jwe)}`;
          window.location.href = redirectUrl.toString();
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
      const arraysToClear = [
        currentExportKey,
        oldExportKey,
        recoveredDrk,
        keysOld?.masterKey,
        keysOld?.wrapKey,
        keysOld?.deriveKey,
        keysNew?.masterKey,
        keysNew?.wrapKey,
        keysNew?.deriveKey,
      ].filter((value): value is Uint8Array => value instanceof Uint8Array);
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setRecoveryLoading(false);
    }
  };

  const unlockWithCurrentPassword = async () => {
    if (!sessionData.email) {
      setError("Email is required to unlock keys");
      return;
    }
    if (!currentPassword) {
      setError("Enter your current password");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    try {
      const currentStart = await opaqueService.startLogin(sessionData.email, currentPassword);
      const currentStartResp = await apiService.passwordVerifyStart(currentStart.request);
      const currentFinish = await opaqueService.finishLogin(
        currentStartResp.message,
        currentStart.state
      );
      opaqueService.clearState(currentStart.state);
      await saveExportKey(sessionData.sub, currentFinish.exportKey);
      cryptoService.clearSensitiveData(currentFinish.sessionKey, currentFinish.exportKey);
      setCurrentPassword("");
      setRecoveryVisible(false);
      queueMicrotask(() => {
        handleAuthorize(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unlock failed";
      setError(
        msg.includes("auth") || msg.includes("OPAQUE") ? "Current password is incorrect" : msg
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

        <div className="authorize-organizations">
          <h3>Organization</h3>
          {organizationsLoading ? (
            <p className="authorize-empty">Loading organizations...</p>
          ) : noActiveOrganizations ? (
            <p className="authorize-empty">
              Your account is not a member of any active organization.
            </p>
          ) : showOrganizationSummary ? (
            <div className="authorize-organization-summary">
              <span className="authorize-scope-icon">🏢</span>
              <div className="authorize-scope-text">
                <span className="authorize-scope-name">
                  {selectedOrganization?.name || "Selected organization"}
                </span>
                <span className="authorize-scope-description">
                  {selectedOrganizationLocked
                    ? `${appName} requested this organization for sign-in.`
                    : "This organization will be used for this sign-in."}
                </span>
              </div>
            </div>
          ) : (
            <fieldset className="authorize-organization-fieldset">
              <legend>Choose which organization to use for this sign-in.</legend>
              <div className="authorize-organization-list">
                {activeOrganizations.map((organization) => {
                  const roles = organization.roles
                    ?.map((role) => role.name || role.key)
                    .filter((role): role is string => !!role);
                  return (
                    <label
                      className="authorize-organization-option"
                      key={organization.organizationId}
                    >
                      <input
                        type="radio"
                        name="organization_id"
                        value={organization.organizationId}
                        checked={selectedOrganizationId === organization.organizationId}
                        onChange={() => setSelectedOrganizationId(organization.organizationId)}
                      />
                      <span className="authorize-organization-option-text">
                        <span className="authorize-scope-name">{organization.name}</span>
                        <span className="authorize-scope-description">
                          {roles && roles.length > 0
                            ? roles.join(", ")
                            : organization.slug
                              ? `Organization: ${organization.slug}`
                              : "Active organization"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        <div className="authorize-scopes da-authorize-scopes">
          <h3>Scopes</h3>
          {authRequest.scopes.length === 0 && !hasZkDeliveryScope ? (
            <p className="authorize-empty">No additional permissions requested.</p>
          ) : (
            <ul className="authorize-scope-list">
              {hasZkDeliveryScope && (
                <li className="authorize-scope-item da-authorize-scope">
                  <span className="authorize-scope-icon">🔐</span>
                  <div className="authorize-scope-text">
                    <span className="authorize-scope-description">Access your encryption keys</span>
                  </div>
                </li>
              )}
              {authRequest.scopes.map((scope) => {
                const scopeInfo = getScopeInfo(scope);
                return (
                  <li key={scope} className="authorize-scope-item da-authorize-scope">
                    <span className="authorize-scope-icon">{scopeInfo.icon}</span>
                    <div className="authorize-scope-text">
                      <span className="authorize-scope-description">{scopeInfo.description}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

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
              We couldn’t access your encryption keys. Unlock with your current password, or if you
              recently changed your password, recover with your previous password.
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
                variant="primary"
                onClick={unlockWithCurrentPassword}
                disabled={recoveryLoading}
              >
                Unlock with current password
              </Button>
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
            disabled={
              loading ||
              organizationsLoading ||
              noActiveOrganizations ||
              (activeOrganizations.length > 1 && !selectedOrganizationId)
            }
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
