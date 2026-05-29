import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService, { type DeviceApprovalResponse, type UserOrganization } from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
import deviceKeyStore from "../services/deviceKeyStore";
import { logger } from "../services/logger";
import opaqueService from "../services/opaque";
import { loadExportKey, saveExportKey } from "../services/sessionKey";
import { loadUnlockedArk, saveUnlockedArk } from "../services/unlockedArk";
import {
  browserSupportsWebAuthn,
  derivePasskeyPrfWrapKey,
  getPasskeyCredential,
  getPasskeyPrfResult,
  serializeAuthenticationResponse,
} from "../services/webauthn";
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
    keyDeliveryVersion?: "v1-drk" | "v2";
    deliveredKeyKind?: "root_key" | "client_app_key";
    clientId?: string;
    redirectUri?: string;
    state?: string;
    zkPub?: string;
    organizationId?: string;
  };
  sessionData: {
    sub: string;
    name?: string;
    email?: string;
    organizationId?: string;
    organizationSlug?: string;
    keyState?: "locked" | "unlocked" | "setup_required";
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
  const [unlockMethod, setUnlockMethod] = useState<
    "password" | "passkey" | "trusted_device" | "recovery" | "new_key"
  >("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [keyUnlocked, setKeyUnlocked] = useState(sessionData.keyState === "unlocked");
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [trustedDeviceCount, setTrustedDeviceCount] = useState(0);
  const [deviceApproval, setDeviceApproval] = useState<DeviceApprovalResponse | null>(null);
  const [deviceApprovalCode, setDeviceApprovalCode] = useState<string | null>(null);
  const [deviceApprovalLoading, setDeviceApprovalLoading] = useState(false);
  const [deviceApprovalStatus, setDeviceApprovalStatus] = useState<string | null>(null);
  const deviceApprovalPollRef = useRef<number | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    authRequest.organizationId || sessionData.organizationId || ""
  );
  const [_zkKeyPair, setZkKeyPair] = useState<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  } | null>(null);
  const currentPasswordId = useId();
  const recoverySecretId = useId();
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
  const showOrganizationSummary = activeOrganizations.length === 1 || selectedOrganizationLocked;
  const keyLockedForZk = authRequest.hasZk && !keyUnlocked;
  const hasTrustedDevices = trustedDeviceCount > 0;

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

  useEffect(() => {
    if (!authRequest.hasZk || keyUnlocked) {
      setTrustedDeviceCount(0);
      return;
    }
    let cancelled = false;
    apiService
      .getTrustedDevices()
      .then((devices) => {
        if (!cancelled) {
          setTrustedDeviceCount(devices.filter((device) => !device.revoked_at).length);
        }
      })
      .catch((error) => {
        logger.warn(error, "Failed to load trusted devices");
        if (!cancelled) setTrustedDeviceCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [authRequest.hasZk, keyUnlocked]);

  useEffect(() => {
    return () => {
      if (deviceApprovalPollRef.current) {
        window.clearInterval(deviceApprovalPollRef.current);
      }
    };
  }, []);

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

  const resolveAccountKeyId = async () => {
    try {
      const keybag = await apiService.getKeybag();
      const activeKey = keybag.account_keys.find((key) => key.status === "active");
      if (activeKey) return activeKey.key_id;
    } catch (error) {
      logger.warn(error, "Failed to load keybag metadata");
    }
    return `legacy-drk:${sessionData.sub}`;
  };

  const createZkDelivery = async (ark: Uint8Array) => {
    const url = new URL(window.location.href);
    const zkPubParam = url.searchParams.get("zk_pub");
    const clientId = url.searchParams.get("client_id") || "";
    if (!zkPubParam || !clientId) {
      throw new Error("Missing zero-knowledge delivery request");
    }
    const zkPubJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(zkPubParam)));
    const keyDeliveryVersion = authRequest.keyDeliveryVersion === "v1-drk" ? "v1-drk" : "v2";

    if (keyDeliveryVersion === "v1-drk") {
      const jwe = await cryptoService.createDrkJWE(ark, zkPubJwk, sessionData.sub, clientId);
      return {
        fragmentName: "drk_jwe",
        drkHash: await sha256Base64Url(jwe),
        jwe,
      } as const;
    }

    const keyId = await resolveAccountKeyId();
    const cak = await cryptoService.deriveClientAppKey(ark, {
      sub: sessionData.sub,
      keyId,
      clientId,
      organizationId: selectedOrganizationId || undefined,
      audience: clientId,
    });
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        typ: "DarkAuth-Client-Key",
        version: "v2",
        sub: sessionData.sub,
        client_id: clientId,
        aud: clientId,
        ...(selectedOrganizationId ? { org_id: selectedOrganizationId } : {}),
        request_id: authRequest.requestId,
        state_hash: await sha256Base64Url(authRequest.state || ""),
        redirect_uri_hash: await sha256Base64Url(authRequest.redirectUri || ""),
        key_id: keyId,
        key_kind: "client_app_key",
        cak: toBase64Url(cak),
        iat: now,
        exp: now + 120,
      } as const;
      const jwe = await cryptoService.createClientKeyJWE(payload, zkPubJwk);
      return {
        fragmentName: "darkauth_key_jwe",
        zkKeyHash: await sha256Base64Url(jwe),
        jwe,
      } as const;
    } finally {
      cryptoService.clearSensitiveData(cak);
    }
  };

  const finalizeWithZk = async (ark: Uint8Array) => {
    const delivery = await createZkDelivery(ark);
    const authResponse = await apiService.authorize({
      requestId: authRequest.requestId,
      approve: true,
      drkHash: "drkHash" in delivery ? delivery.drkHash : undefined,
      zkKeyHash: "zkKeyHash" in delivery ? delivery.zkKeyHash : undefined,
      organizationId: selectedOrganizationId || undefined,
    });
    const redirectUrl = new URL(authResponse.redirectUrl);
    redirectUrl.hash = `${delivery.fragmentName}=${encodeURIComponent(delivery.jwe)}`;
    window.location.href = redirectUrl.toString();
  };

  const storePasswordEnvelope = async (ark: Uint8Array, wrapKey: Uint8Array) => {
    const accountKey = await apiService.createAccountKey({ version: "v2" });
    const wrappingAlg = "OPAQUE-HKDF-SHA256+A256GCM/v2";
    const envelopeId = `env_${crypto.randomUUID()}`;
    const aad = cryptoService.envelopeAad({
      sub: sessionData.sub,
      keyId: accountKey.key_id,
      envelopeId,
      type: "password",
      wrappingAlg,
    });
    const wrappedArk = await cryptoService.wrapKeyMaterial(ark, wrapKey, aad);
    await apiService.createKeyEnvelope({
      envelopeId,
      keyId: accountKey.key_id,
      type: "password",
      label: "Password",
      wrappingAlg,
      wrappedKey: toBase64Url(wrappedArk),
      aad: toBase64Url(aad),
      metadata: { version: "v2" },
    });
    return accountKey.key_id;
  };

  const generateVerificationCode = () => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return String(value % 1000000).padStart(6, "0");
  };

  const stopDeviceApprovalPolling = () => {
    if (deviceApprovalPollRef.current) {
      window.clearInterval(deviceApprovalPollRef.current);
      deviceApprovalPollRef.current = null;
    }
  };

  const consumeDeviceApproval = async (approval: DeviceApprovalResponse, privateKey: CryptoKey) => {
    const encryptedApproval = approval.encrypted_approval;
    if (!encryptedApproval) return false;
    let ark: Uint8Array | null = null;
    try {
      ark = await cryptoService.decryptDeviceApprovalJWE(encryptedApproval, privateKey);
      stopDeviceApprovalPolling();
      setDeviceApprovalStatus("Approved. Finalizing authorization...");
      setKeyUnlocked(true);
      await finalizeWithZk(ark);
      return true;
    } finally {
      if (ark) {
        cryptoService.clearSensitiveData(ark);
      }
    }
  };

  const startDeviceApprovalPolling = (
    approval: DeviceApprovalResponse,
    privateKey: CryptoKey,
    publicJwk: JsonWebKey
  ) => {
    stopDeviceApprovalPolling();
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const consumed = await apiService.consumeDeviceApproval(approval.request_id, {
          newDeviceProof: await sha256Base64Url(JSON.stringify(publicJwk)),
        });
        const status = consumed.status || "pending";
        if (consumed.encrypted_approval) {
          await consumeDeviceApproval(consumed, privateKey);
        } else if (status === "denied" || status === "expired") {
          stopDeviceApprovalPolling();
          setDeviceApprovalStatus(
            status === "denied"
              ? "The approval request was denied."
              : "The approval request expired."
          );
        } else if (attempts > 40) {
          stopDeviceApprovalPolling();
          setDeviceApprovalStatus("Approval timed out. You can try again or enter your password.");
        } else {
          setDeviceApprovalStatus("Waiting for approval on another trusted device...");
        }
      } catch {
        if (attempts > 40) {
          stopDeviceApprovalPolling();
          setDeviceApprovalStatus("Approval timed out. You can try again or enter your password.");
        } else {
          logger.debug({ requestId: approval.request_id }, "Device approval still pending");
        }
      }
    };
    void tick();
    deviceApprovalPollRef.current = window.setInterval(tick, 3000);
  };

  const requestDeviceApproval = async () => {
    if (!hasTrustedDevices) {
      setRecoveryVisible(true);
      setError("No trusted devices are available. Enter your password to continue.");
      return;
    }
    setDeviceApprovalLoading(true);
    setError(null);
    setDeviceApprovalStatus(null);
    try {
      const url = new URL(window.location.href);
      const clientId = url.searchParams.get("client_id") || authRequest.clientId || "";
      if (!clientId) {
        throw new Error("Missing client id for device approval");
      }
      const keyPair = await cryptoService.generateECDHKeyPair();
      const publicJwk = await cryptoService.exportPublicKeyJWK(keyPair.publicKey);
      const code = generateVerificationCode();
      const approval = await apiService.createDeviceApproval({
        newDevicePublicJwk: publicJwk,
        clientId,
        stateHash: await sha256Base64Url(authRequest.state || ""),
        verificationCodeHash: await sha256Base64Url(code),
      });
      const nextApproval = {
        ...approval,
        verification_code: approval.verification_code || code,
      };
      setDeviceApproval(nextApproval);
      setDeviceApprovalCode(nextApproval.verification_code || code);
      setDeviceApprovalStatus("Waiting for approval on another trusted device...");
      setRecoveryVisible(false);
      startDeviceApprovalPolling(nextApproval, keyPair.privateKey, publicJwk);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to request device approval");
    } finally {
      setDeviceApprovalLoading(false);
    }
  };

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
      if (approve && keyLockedForZk) {
        setLoading(false);
        if (hasTrustedDevices) {
          await requestDeviceApproval();
        } else {
          setRecoveryVisible(true);
          setError("Unlock your encryption keys to continue.");
        }
        return;
      }
      if (approve && authRequest.hasZk) {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";

        if (zkPubParam && clientId) {
          let exportKey: Uint8Array | null = null;
          let keys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
          let drk: Uint8Array | null = null;
          try {
            const unlockedArk = loadUnlockedArk(sessionData.sub);
            if (unlockedArk) {
              drk = unlockedArk;
              await finalizeWithZk(drk);
              return;
            }
            const wrappedDrkB64 = await apiService.getWrappedDrk();
            const wrappedDrk = fromBase64Url(wrappedDrkB64);
            exportKey = await loadExportKey(sessionData.sub);
            if (!exportKey) {
              throw new Error("Missing export key");
            }
            keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
            drk = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
            await finalizeWithZk(drk);
            return;
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Zero-knowledge delivery failed. Please retry."
            );
            setRecoveryVisible(true);
            return;
          } finally {
            cryptoService.clearSensitiveData(
              ...(exportKey ? [exportKey] : []),
              ...(keys ? [keys.masterKey, keys.wrapKey, keys.deriveKey] : []),
              ...(drk ? [drk] : [])
            );
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

      cryptoService.clearSensitiveData(exportKey);
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys keys derived");
      const drk = await cryptoService.generateDRK();
      const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sessionData.sub);
      logger.debug({ sub: sessionData.sub }, "[Authorize] generateNewKeys storing wrapped DRK");
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
      await storePasswordEnvelope(drk, keys.wrapKey);
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
      setKeyUnlocked(true);
      setRecoveryVisible(false);
      const drkForHandoff = drk.slice();
      saveUnlockedArk(sessionData.sub, drkForHandoff);
      cryptoService.clearSensitiveData(drk);
      try {
        const url = new URL(window.location.href);
        const zkPubParam = url.searchParams.get("zk_pub");
        const clientId = url.searchParams.get("client_id") || "";
        if (authRequest.hasZk && zkPubParam && clientId) {
          logger.debug(
            { requestId: authRequest.requestId },
            "[Authorize] finalize immediately after generateNewKeys"
          );
          await finalizeWithZk(drkForHandoff);
          cryptoService.clearSensitiveData(drkForHandoff);
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

  const finishUnlockWithArk = async (ark: Uint8Array) => {
    saveUnlockedArk(sessionData.sub, ark);
    setKeyUnlocked(true);
    setRecoveryVisible(false);
    await finalizeWithZk(ark);
  };

  const unlockWithRecoveryKey = async () => {
    const secret = recoverySecret.trim();
    if (!secret) {
      setError("Enter your recovery key");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    let secretBytes: Uint8Array | null = null;
    let verifier: Uint8Array | null = null;
    let wrapKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    try {
      const recoveryKeys = await apiService.getRecoveryKeys();
      const active = recoveryKeys.find((key) => !key.revoked_at);
      if (!active?.recovery_key_id) {
        throw new Error("No recovery key is registered for this account.");
      }
      secretBytes = fromBase64Url(secret);
      verifier = await cryptoService.deriveRecoveryVerifier(secretBytes);
      const used = await apiService.recordRecoveryKeyUse(
        active.recovery_key_id,
        toBase64Url(verifier)
      );
      if (!used.envelope) {
        throw new Error("Recovery key envelope is missing.");
      }
      wrapKey = await cryptoService.deriveRecoveryKeyMaterial(secretBytes, sessionData.sub);
      ark = await cryptoService.unwrapKeyMaterial(
        fromBase64Url(used.envelope.wrapped_key),
        wrapKey,
        fromBase64Url(used.envelope.aad)
      );
      setRecoverySecret("");
      await finishUnlockWithArk(ark);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recovery key unlock failed");
    } finally {
      const arraysToClear = [secretBytes, verifier, wrapKey, ark].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setRecoveryLoading(false);
    }
  };

  const unlockWithTrustedDevice = async () => {
    setRecoveryLoading(true);
    setError(null);
    let ark: Uint8Array | null = null;
    try {
      const keybag = await apiService.getKeybag();
      for (const envelope of keybag.envelopes) {
        if (envelope.revoked_at || envelope.type !== "trusted_device") continue;
        const metadata = envelope.metadata || {};
        const handle =
          typeof metadata.key_handle === "string"
            ? metadata.key_handle
            : typeof metadata.handle === "string"
              ? metadata.handle
              : null;
        if (!handle) continue;
        const localKey = await deviceKeyStore.getKey(handle);
        if (!localKey) continue;
        ark = await cryptoService.unwrapKeyMaterialWithAesKey(
          fromBase64Url(envelope.wrapped_key),
          localKey,
          fromBase64Url(envelope.aad)
        );
        await finishUnlockWithArk(ark);
        return;
      }
      throw new Error("This browser does not have a usable trusted-device key.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trusted-device unlock failed");
    } finally {
      if (ark) cryptoService.clearSensitiveData(ark);
      setRecoveryLoading(false);
    }
  };

  const unlockWithPasskey = async () => {
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support passkey unlock.");
      return;
    }
    setRecoveryLoading(true);
    setError(null);
    let prfResult: Uint8Array | null = null;
    let wrapKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    try {
      const start = await apiService.webAuthnLoginStart();
      const credential = await getPasskeyCredential(start.public_key);
      prfResult = getPasskeyPrfResult(credential);
      const finish = await apiService.webAuthnLoginFinish({
        challengeId: start.challenge_id,
        response: serializeAuthenticationResponse(credential),
        prfResultConfirmed: !!prfResult,
      });
      if (!prfResult || !finish.unlock?.envelope) {
        throw new Error("This passkey signed you in but did not unlock encryption keys.");
      }
      wrapKey = await derivePasskeyPrfWrapKey({
        prfResult,
        sub: finish.sub,
        credentialId: finish.credential.credential_id,
      });
      ark = await cryptoService.unwrapKeyMaterial(
        fromBase64Url(finish.unlock.envelope.wrapped_key),
        wrapKey,
        fromBase64Url(finish.unlock.envelope.aad)
      );
      await finishUnlockWithArk(ark);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey unlock failed");
    } finally {
      const arraysToClear = [prfResult, wrapKey, ark].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
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
    let exportKey: Uint8Array | null = null;
    let keys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    let ark: Uint8Array | null = null;
    try {
      const currentStart = await opaqueService.startLogin(sessionData.email, currentPassword);
      const currentStartResp = await apiService.passwordVerifyStart(currentStart.request);
      const currentFinish = await opaqueService.finishLogin(
        currentStartResp.message,
        currentStart.state
      );
      opaqueService.clearState(currentStart.state);
      await saveExportKey(sessionData.sub, currentFinish.exportKey);
      exportKey = currentFinish.exportKey;
      keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      ark = await cryptoService.unwrapDRK(
        fromBase64Url(await apiService.getWrappedDrk()),
        keys.wrapKey,
        sessionData.sub
      );
      saveUnlockedArk(sessionData.sub, ark);
      cryptoService.clearSensitiveData(currentFinish.sessionKey);
      setCurrentPassword("");
      await finishUnlockWithArk(ark);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unlock failed";
      setError(
        msg.includes("auth") || msg.includes("OPAQUE") ? "Current password is incorrect" : msg
      );
    } finally {
      const arraysToClear = [
        exportKey,
        keys?.masterKey,
        keys?.wrapKey,
        keys?.deriveKey,
        ark,
      ].filter((value): value is Uint8Array => value instanceof Uint8Array);
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
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

        {deviceApproval && (
          <div className="authorize-recovery">
            <h3>Accept on another device</h3>
            <p>
              Open Security Settings on a trusted device, approve this request, and confirm the
              verification code matches.
            </p>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 28,
                letterSpacing: 6,
                textAlign: "center",
                padding: 12,
                borderRadius: 8,
                background: "hsl(var(--muted))",
                margin: "12px 0",
              }}
            >
              {deviceApprovalCode}
            </div>
            {deviceApprovalStatus && <div className="help-text">{deviceApprovalStatus}</div>}
          </div>
        )}

        {recoveryVisible && (
          <div className="authorize-recovery">
            <h3>Unlock encryption keys</h3>
            <p>You are signed in, but this app needs zero-knowledge key delivery.</p>
            <div className="authorize-unlock-methods">
              {[
                ["password", "Password"],
                ["passkey", "PRF passkey"],
                ["trusted_device", "This trusted browser"],
                ["recovery", "Recovery key"],
                ["new_key", "Create new keys"],
              ].map(([value, label]) => (
                <label className="authorize-unlock-option" key={value}>
                  <input
                    type="radio"
                    name="unlock_method"
                    value={value}
                    checked={unlockMethod === value}
                    onChange={() =>
                      setUnlockMethod(
                        value as "password" | "passkey" | "trusted_device" | "recovery" | "new_key"
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {unlockMethod === "password" && (
              <div className="form-group">
                <label htmlFor={currentPasswordId}>Password</label>
                <input
                  id={currentPasswordId}
                  type="password"
                  placeholder="Enter your password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            )}
            {unlockMethod === "recovery" && (
              <div className="form-group">
                <label htmlFor={recoverySecretId}>Recovery key</label>
                <input
                  id={recoverySecretId}
                  type="password"
                  placeholder="Paste your recovery key"
                  value={recoverySecret}
                  onChange={(e) => setRecoverySecret(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            {unlockMethod === "passkey" && (
              <p className="help-text">
                Use a passkey that was registered with encryption unlock support.
              </p>
            )}
            {unlockMethod === "trusted_device" && (
              <p className="help-text">
                Use the key stored in this browser when it was marked as trusted.
              </p>
            )}
            {unlockMethod === "new_key" && (
              <p className="help-text">
                This creates a new account root key. Existing encrypted app data that depends on the
                old key may no longer be readable.
              </p>
            )}
            <div className="actions da-authorize-actions">
              <Button
                type="button"
                variant="primary"
                onClick={
                  unlockMethod === "password"
                    ? unlockWithCurrentPassword
                    : unlockMethod === "passkey"
                      ? unlockWithPasskey
                      : unlockMethod === "trusted_device"
                        ? unlockWithTrustedDevice
                        : unlockMethod === "recovery"
                          ? unlockWithRecoveryKey
                          : generateNewKeys
                }
                disabled={recoveryLoading}
              >
                {recoveryLoading ? (
                  <>
                    <span className="loading-spinner" />
                    Unlocking...
                  </>
                ) : (
                  "Continue"
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

          {keyLockedForZk && hasTrustedDevices && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRecoveryVisible(true);
                setError(null);
              }}
              disabled={loading || deviceApprovalLoading}
            >
              Enter password
            </Button>
          )}

          <Button
            type="button"
            variant="success"
            onClick={() =>
              keyLockedForZk && hasTrustedDevices ? requestDeviceApproval() : handleAuthorize(true)
            }
            disabled={
              loading ||
              deviceApprovalLoading ||
              organizationsLoading ||
              noActiveOrganizations ||
              (activeOrganizations.length > 1 && !selectedOrganizationId)
            }
          >
            {loading || deviceApprovalLoading ? (
              <>
                <span className="loading-spinner" />
                {deviceApprovalLoading
                  ? "Requesting approval..."
                  : branding.getText("authorizing", "Authorizing...")}
              </>
            ) : keyLockedForZk && hasTrustedDevices ? (
              "Accept on another device"
            ) : keyLockedForZk ? (
              "Enter password"
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
