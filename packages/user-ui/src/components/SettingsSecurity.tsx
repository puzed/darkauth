import type { LucideIcon } from "lucide-react";
import {
  Fingerprint,
  KeyRound,
  Laptop,
  LifeBuoy,
  ListChecks,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import api, {
  type ConnectedIdentityResponse,
  type DeviceApprovalResponse,
  type FederationConnectionRoute,
  type KeybagResponse,
  type RecoveryKeyResponse,
  type TrustedDeviceResponse,
  type WebAuthnCredentialResponse,
} from "../services/api";
import cryptoService, { fromBase64Url, toBase64Url } from "../services/crypto";
import deviceKeyStore from "../services/deviceKeyStore";
import { defaultUnlockPolicy, type UnlockPolicy } from "../services/unlockPolicy";
import {
  createPasskeyCredential,
  derivePasskeyPrfWrapKey,
  getPasskeyPrfResult,
  passkeyPrfEnabled,
  serializeRegistrationResponse,
} from "../services/webauthn";
import Button from "./Button";
import { loadArkFromAvailableLocalUnlocks } from "./KeyUnlockPanel";
import { cx, StatusPill } from "./Portal";
import styles from "./SettingsSecurity.module.css";

type SecuritySection =
  | "overview"
  | "signin"
  | "passkeys"
  | "unlock"
  | "devices"
  | "recovery"
  | "mfa"
  | "advanced";

export type SettingsSecurityPreviewData = {
  status: {
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
    backup_codes_remaining?: number;
    required?: boolean;
  } | null;
  keybag: KeybagResponse | null;
  trustedDevices: TrustedDeviceResponse[];
  deviceApprovals: DeviceApprovalResponse[];
  recoveryKeys: RecoveryKeyResponse[];
  passkeys: WebAuthnCredentialResponse[];
  unlockPolicy: UnlockPolicy;
  connectedIdentities: ConnectedIdentityResponse[];
  enterpriseSsoRoute: FederationConnectionRoute | null;
};

export default function SettingsSecurity({
  sessionData,
  previewData,
}: {
  sessionData: {
    sub: string;
    email?: string;
    keyState?: "locked" | "unlocked" | "setup_required";
  };
  previewData?: SettingsSecurityPreviewData;
}) {
  const [loading, setLoading] = useState(!previewData);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
    backup_codes_remaining?: number;
    required?: boolean;
  } | null>(previewData?.status || null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [keybag, setKeybag] = useState<KeybagResponse | null>(previewData?.keybag || null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceResponse[]>(
    previewData?.trustedDevices || []
  );
  const [deviceApprovals, setDeviceApprovals] = useState<DeviceApprovalResponse[]>(
    previewData?.deviceApprovals || []
  );
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);
  const [trustDeviceLoading, setTrustDeviceLoading] = useState(false);
  const [trustedDeviceMessage, setTrustedDeviceMessage] = useState<string | null>(null);
  const [recoveryKeys, setRecoveryKeys] = useState<RecoveryKeyResponse[]>(
    previewData?.recoveryKeys || []
  );
  const [recoverySecret, setRecoverySecret] = useState<string | null>(null);
  const [recoverySecretSaved, setRecoverySecretSaved] = useState(false);
  const [recoveryActionLoading, setRecoveryActionLoading] = useState<string | null>(null);
  const [passkeyActionLoading, setPasskeyActionLoading] = useState(false);
  const [passkeyRevokeLoading, setPasskeyRevokeLoading] = useState<string | null>(null);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<WebAuthnCredentialResponse[]>(
    previewData?.passkeys || []
  );
  const [unlockPolicy, setUnlockPolicy] = useState<UnlockPolicy>(
    previewData?.unlockPolicy || defaultUnlockPolicy
  );
  const [connectedIdentities, setConnectedIdentities] = useState<ConnectedIdentityResponse[]>(
    previewData?.connectedIdentities || []
  );
  const [enterpriseSsoRoute, setEnterpriseSsoRoute] = useState<FederationConnectionRoute | null>(
    previewData?.enterpriseSsoRoute || null
  );
  const [passkeyCompatibility, setPasskeyCompatibility] = useState<{
    webauthn: boolean;
    platformAuthenticator: boolean | null;
    conditionalMediation: boolean | null;
  } | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [activeSection, setActiveSection] = useState<SecuritySection>("overview");

  const reload = useCallback(async () => {
    if (previewData) {
      setLoading(false);
      setError(null);
      setBackupCodes(null);
      setStatus(previewData.status);
      setKeybag(previewData.keybag);
      setTrustedDevices(previewData.trustedDevices);
      setDeviceApprovals(previewData.deviceApprovals);
      setRecoveryKeys(previewData.recoveryKeys);
      setPasskeys(previewData.passkeys);
      setUnlockPolicy(previewData.unlockPolicy);
      setConnectedIdentities(previewData.connectedIdentities);
      setEnterpriseSsoRoute(previewData.enterpriseSsoRoute);
      setProvisioningUri(null);
      setSecret(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setBackupCodes(null);
      const [s, keys, devices, approvals, recovery, credentials, policy, identities, ssoRoute] =
        await Promise.all([
          api.getOtpStatus(),
          api.getKeybag().catch(() => null),
          api.getTrustedDevices(),
          api.getDeviceApprovals(),
          api.getRecoveryKeys().catch(() => []),
          api.getWebAuthnCredentials().catch(() => []),
          api.getUnlockPolicy().catch(() => defaultUnlockPolicy),
          api.getConnectedIdentities().catch(() => []),
          sessionData.email ? api.getFederationRoute(sessionData.email).catch(() => null) : null,
        ]);
      setStatus(s);
      setKeybag(keys);
      setTrustedDevices(devices);
      setDeviceApprovals(approvals);
      setRecoveryKeys(recovery);
      setPasskeys(credentials);
      setUnlockPolicy(policy);
      setConnectedIdentities(identities);
      setEnterpriseSsoRoute(ssoRoute);
      setProvisioningUri(null);
      setSecret(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load security settings");
    } finally {
      setLoading(false);
    }
  }, [previewData, sessionData.email]);

  const refreshDeviceApprovals = useCallback(async () => {
    try {
      setDeviceApprovals(await api.getDeviceApprovals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh device approvals");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (previewData) return undefined;
    const activeDeviceCount = trustedDevices.filter((device) => !device.revoked_at).length;
    if (loading || activeDeviceCount < 1) return undefined;
    const interval = window.setInterval(() => {
      void api
        .getDeviceApprovals()
        .then(setDeviceApprovals)
        .catch(() => {});
    }, 10000);
    return () => window.clearInterval(interval);
  }, [loading, previewData, trustedDevices]);

  useEffect(() => {
    const credentialApi = window.PublicKeyCredential as
      | (typeof PublicKeyCredential & {
          isConditionalMediationAvailable?: () => Promise<boolean>;
        })
      | undefined;
    const webauthn =
      typeof credentialApi !== "undefined" && typeof navigator.credentials?.create === "function";
    if (!webauthn) {
      setPasskeyCompatibility({
        webauthn: false,
        platformAuthenticator: null,
        conditionalMediation: null,
      });
      return;
    }
    Promise.all([
      credentialApi.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false) ??
        Promise.resolve(false),
      credentialApi.isConditionalMediationAvailable?.().catch(() => false) ??
        Promise.resolve(false),
    ]).then(([platformAuthenticator, conditionalMediation]) => {
      setPasskeyCompatibility({
        webauthn: true,
        platformAuthenticator,
        conditionalMediation,
      });
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (provisioningUri && qrCanvasRef.current) {
          await QRCode.toCanvas(qrCanvasRef.current, provisioningUri, { width: 192, margin: 1 });
        }
      } catch {}
    })();
  }, [provisioningUri]);

  const doSetupVerify = async () => {
    try {
      setError(null);
      const res = await api.otpSetupVerify(code);
      setBackupCodes(res.backup_codes);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doResetup = async () => {
    try {
      setError(null);
      const init = await api.otpSetupInit();
      setProvisioningUri(init.provisioning_uri);
      setSecret(init.secret);
      setStatus((prev) => (prev ? { ...prev, verified: false } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resetup failed");
    }
  };

  const revokeEnvelope = async (envelopeId: string) => {
    try {
      setError(null);
      await api.revokeKeyEnvelope(envelopeId);
      setKeybag(await api.getKeybag());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    }
  };

  const getOrCreateAccountKeyId = async () => {
    const keys = keybag ?? (await api.getKeybag());
    const active = keys.account_keys.find((key) => key.status === "active");
    if (active) return active.key_id;
    const accountKey = await api.createAccountKey({ version: "v2" });
    return accountKey.key_id;
  };

  const getUnlockedArk = async () => loadArkFromAvailableLocalUnlocks(sessionData.sub);

  const registerPasskey = async () => {
    let ark: Uint8Array | null = null;
    let prfResult: Uint8Array | null = null;
    let wrapKey: Uint8Array | null = null;
    let wrappedKey: Uint8Array | null = null;
    try {
      setPasskeyActionLoading(true);
      setPasskeyMessage(null);
      setError(null);
      const start = await api.webAuthnRegisterStart();
      const credential = await createPasskeyCredential(start.public_key);
      const finish = await api.webAuthnRegisterFinish({
        challengeId: start.challenge_id,
        response: serializeRegistrationResponse(credential),
        label: "Passkey",
      });
      prfResult = getPasskeyPrfResult(credential);
      const credentialId = finish.credential.credential_id;
      if (
        finish.credential.prf_supported &&
        passkeyPrfEnabled(credential) &&
        prfResult &&
        unlockPolicy.allowPasskeyPrfEnvelope
      ) {
        ark = await getUnlockedArk();
        if (ark) {
          const keyId = await getOrCreateAccountKeyId();
          const envelopeId = `env_${crypto.randomUUID()}`;
          const wrappingAlg = "WebAuthn-PRF-HKDF-SHA256+A256GCM/v2";
          const aad = cryptoService.envelopeAad({
            sub: sessionData.sub,
            keyId,
            envelopeId,
            type: "passkey_prf",
            wrappingAlg,
          });
          wrapKey = await derivePasskeyPrfWrapKey({
            prfResult,
            sub: sessionData.sub,
            credentialId,
          });
          wrappedKey = await cryptoService.wrapKeyMaterial(ark, wrapKey, aad);
          const prfSalt = start.public_key.extensions
            ? String(
                (
                  start.public_key.extensions as {
                    prf?: { eval?: { first?: string } };
                  }
                ).prf?.eval?.first || ""
              )
            : "";
          if (!prfSalt) {
            throw new Error("Passkey PRF setup did not include a server salt.");
          }
          await api.createPasskeyPrfEnvelope({
            credentialId,
            keyId,
            envelopeId,
            label: "Passkey",
            wrappingAlg,
            wrappedKey: toBase64Url(wrappedKey),
            aad: toBase64Url(aad),
            prfSalt,
            prfResultConfirmed: true,
            metadata: { version: "v2" },
          });
          setPasskeyMessage("Passkey registered for sign-in and encryption unlock.");
        } else {
          setPasskeyMessage(
            "Passkey registered for sign-in. Unlock this browser to add key unlock."
          );
        }
      } else if (!unlockPolicy.allowPasskeyPrfEnvelope && prfResult) {
        setPasskeyMessage(
          "Passkey registered for sign-in. Your organization disabled passkey encryption unlock."
        );
      } else {
        setPasskeyMessage(
          "Passkey registered for sign-in. This authenticator did not return PRF unlock material."
        );
      }
      const [keysAfterRegister, passkeysAfterRegister] = await Promise.all([
        api.getKeybag().catch(() => null),
        api.getWebAuthnCredentials().catch(() => []),
      ]);
      setKeybag(keysAfterRegister);
      setPasskeys(passkeysAfterRegister);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register passkey");
    } finally {
      const arraysToClear = [ark, prfResult, wrapKey, wrappedKey].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setPasskeyActionLoading(false);
    }
  };

  const revokePasskey = async (credentialId: string) => {
    try {
      setPasskeyRevokeLoading(credentialId);
      setPasskeyMessage(null);
      setError(null);
      await api.revokeWebAuthnCredential(credentialId);
      const [keysAfterRevoke, passkeysAfterRevoke] = await Promise.all([
        api.getKeybag().catch(() => null),
        api.getWebAuthnCredentials().catch(() => []),
      ]);
      setKeybag(keysAfterRevoke);
      setPasskeys(passkeysAfterRevoke);
      setPasskeyMessage("Passkey revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke passkey");
    } finally {
      setPasskeyRevokeLoading(null);
    }
  };

  const createRecoveryKey = async () => {
    let ark: Uint8Array | null = null;
    let secretBytes: Uint8Array | null = null;
    let recoveryWrapKey: Uint8Array | null = null;
    let verifier: Uint8Array | null = null;
    let wrappedKey: Uint8Array | null = null;
    try {
      setRecoveryActionLoading("create");
      setRecoverySecret(null);
      setRecoverySecretSaved(false);
      setError(null);
      ark = await getUnlockedArk();
      if (!ark) {
        throw new Error("Unlock this browser before creating a recovery key.");
      }
      const keyId = await getOrCreateAccountKeyId();
      secretBytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
      const secret = toBase64Url(secretBytes);
      recoveryWrapKey = await cryptoService.deriveRecoveryKeyMaterial(secretBytes, sessionData.sub);
      verifier = await cryptoService.deriveRecoveryVerifier(secretBytes);
      const recoveryKeyId = `rk_${crypto.randomUUID()}`;
      const envelopeId = `env_${crypto.randomUUID()}`;
      const wrappingAlg = "DarkAuth-Recovery-HKDF-SHA256+A256GCM/v2";
      const aad = cryptoService.envelopeAad({
        sub: sessionData.sub,
        keyId,
        envelopeId,
        type: "recovery",
        wrappingAlg,
      });
      wrappedKey = await cryptoService.wrapKeyMaterial(ark, recoveryWrapKey, aad);
      await api.createRecoveryKey({
        recoveryKeyId,
        envelopeId,
        keyId,
        label: "Recovery key",
        wrappingAlg,
        wrappedKey: toBase64Url(wrappedKey),
        aad: toBase64Url(aad),
        verifier: toBase64Url(verifier),
        metadata: { version: "v2" },
        revokeExisting: activeRecoveryKeys.length > 0,
      });
      setRecoverySecret(secret);
      const [keysAfterCreate, recoveryAfterCreate] = await Promise.all([
        api.getKeybag(),
        api.getRecoveryKeys(),
      ]);
      setKeybag(keysAfterCreate);
      setRecoveryKeys(recoveryAfterCreate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create recovery key");
    } finally {
      const arraysToClear = [ark, secretBytes, recoveryWrapKey, verifier, wrappedKey].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setRecoveryActionLoading(null);
    }
  };

  const revokeRecoveryKey = async (recoveryKeyId: string) => {
    try {
      setRecoveryActionLoading(recoveryKeyId);
      setError(null);
      await api.revokeRecoveryKey(recoveryKeyId);
      const [keysAfterRevoke, recoveryAfterRevoke] = await Promise.all([
        api.getKeybag(),
        api.getRecoveryKeys(),
      ]);
      setKeybag(keysAfterRevoke);
      setRecoveryKeys(recoveryAfterRevoke);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke recovery key");
    } finally {
      setRecoveryActionLoading(null);
    }
  };

  const revokeTrustedDevice = async (deviceId: string) => {
    try {
      setDeviceActionLoading(deviceId);
      setError(null);
      await api.revokeTrustedDevice(deviceId);
      setTrustedDevices(await api.getTrustedDevices());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke trusted device");
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const trustCurrentDevice = async () => {
    if (!unlockPolicy.allowTrustedDeviceApproval) {
      setError("Trusted-device approval is disabled by your organization policy.");
      return;
    }
    let ark: Uint8Array | null = null;
    let wrappedKey: Uint8Array | null = null;
    let handle: string | null = null;
    try {
      setTrustDeviceLoading(true);
      setError(null);
      setTrustedDeviceMessage(null);
      ark = await getUnlockedArk();
      if (!ark) {
        throw new Error("Unlock this browser before trusting this device.");
      }
      const keyId = await getOrCreateAccountKeyId();
      const localKey = await deviceKeyStore.createKeyHandle(sessionData.sub);
      handle = localKey.handle;
      const envelopeId = `env_${crypto.randomUUID()}`;
      const wrappingAlg = "DarkAuth-DeviceLocal-AESGCM/v2";
      const aad = cryptoService.envelopeAad({
        sub: sessionData.sub,
        keyId,
        envelopeId,
        type: "trusted_device",
        wrappingAlg,
      });
      wrappedKey = await cryptoService.wrapKeyMaterialWithAesKey(ark, localKey.key, aad);
      await api.createKeyEnvelope({
        envelopeId,
        keyId,
        type: "trusted_device",
        label: "This browser",
        wrappingAlg,
        wrappedKey: toBase64Url(wrappedKey),
        aad: toBase64Url(aad),
        metadata: { version: "v2", key_handle: handle },
      });
      await api.createTrustedDevice({
        label: "This browser",
        publicKeyJwk: localKey.approvalPublicJwk,
        keyHandle: handle,
        envelopeId,
      });
      const [keysAfterTrust, devicesAfterTrust] = await Promise.all([
        api.getKeybag(),
        api.getTrustedDevices(),
      ]);
      setKeybag(keysAfterTrust);
      setTrustedDevices(devicesAfterTrust);
      setTrustedDeviceMessage("This browser is trusted for encrypted key approvals.");
    } catch (e) {
      if (handle) {
        await deviceKeyStore.deleteKey(handle).catch(() => {});
      }
      setError(e instanceof Error ? e.message : "Failed to trust this device");
    } finally {
      const arraysToClear = [ark, wrappedKey].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setTrustDeviceLoading(false);
    }
  };

  const denyApproval = async (requestId: string) => {
    try {
      setDeviceActionLoading(requestId);
      setError(null);
      await api.denyDeviceApproval(requestId);
      await refreshDeviceApprovals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deny approval request");
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const approveApproval = async (approval: DeviceApprovalResponse) => {
    const requestId = approval.request_id;
    const recipientPublicJwk = approval.new_device_public_jwk;
    if (!recipientPublicJwk) {
      setError("This approval request is missing the new device public key.");
      return;
    }
    const approvingDevice = trustedDevices.find(
      (device) => !device.revoked_at && (device.public_jwk || device.public_key_jwk)?.kty === "EC"
    );
    if (!approvingDevice) {
      setError("No trusted browser with approval proof support is available.");
      return;
    }
    const handle = approvingDevice.key_handle;
    const approvalAad = approval.approval_aad;
    if (!handle || !approvalAad) {
      setError("This approval request cannot be approved by this browser.");
      return;
    }

    let ark: Uint8Array | null = null;
    try {
      setDeviceActionLoading(requestId);
      setError(null);
      ark = await getUnlockedArk();
      if (!ark) {
        throw new Error("Unlock this browser before approving another device.");
      }
      const approvalPrivateKey = await deviceKeyStore.getApprovalPrivateKey(handle);
      if (!approvalPrivateKey) {
        throw new Error(
          "This browser is missing its approval key. Trust it again before approving."
        );
      }
      const encryptedApproval = await cryptoService.createDeviceApprovalJWE(
        ark,
        recipientPublicJwk,
        {
          sub: sessionData.sub,
          requestId,
        }
      );
      const approvalProof = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        approvalPrivateKey,
        fromBase64Url(approvalAad) as BufferSource
      );
      await api.approveDeviceApproval(requestId, {
        encryptedApproval,
        approvalAad,
        approvalProof: toBase64Url(approvalProof),
        approvedDeviceId: approvingDevice.device_id,
      });
      await refreshDeviceApprovals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve device");
    } finally {
      const arraysToClear = [ark].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setDeviceActionLoading(null);
    }
  };

  const activeTrustedDevices = trustedDevices.filter((device) => !device.revoked_at);
  const activeEnvelopes = keybag?.envelopes.filter((envelope) => !envelope.revoked_at) ?? [];
  const activePasskeys = passkeys.filter((passkey) => !passkey.revoked_at);
  const unlockPasskeys = activePasskeys.filter((passkey) => passkey.can_unlock);
  const authOnlyPasskeys = activePasskeys.filter((passkey) => !passkey.can_unlock);
  const recoveryEnvelopes = activeEnvelopes.filter((envelope) => envelope.type === "recovery");
  const activeRecoveryKeys = recoveryKeys.filter((key) => !key.revoked_at);
  const passwordEnvelopeCount = activeEnvelopes.filter(
    (envelope) => envelope.type === "password"
  ).length;
  const connectedIdentityCount = connectedIdentities.length;
  const pendingApprovals = deviceApprovals.filter((approval) => {
    const status = approval.status || "pending";
    return status === "pending" || status === "requested";
  });
  const formatDate = (value?: string | null) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const securityRows: Array<{
    id: SecuritySection;
    label: string;
    detail: string;
    state: string;
    tone: "ready" | "action" | "neutral";
    count?: number;
    Icon: LucideIcon;
  }> = [
    {
      id: "signin",
      label: "Sign-in",
      detail: "Password, SSO, and connected identities",
      state: connectedIdentityCount || enterpriseSsoRoute ? "Configured" : "Password",
      tone: "ready",
      count: 1 + connectedIdentityCount + (enterpriseSsoRoute ? 1 : 0),
      Icon: LockKeyhole,
    },
    {
      id: "passkeys",
      label: "Passkeys",
      detail: "Sign in faster and optionally unlock encrypted apps",
      state: activePasskeys.length ? `${activePasskeys.length} active` : "Not set",
      tone: activePasskeys.length ? "ready" : "action",
      count: activePasskeys.length,
      Icon: Fingerprint,
    },
    {
      id: "unlock",
      label: "Encrypted app access",
      detail: "Control how this browser unlocks zero-knowledge app keys",
      state: sessionData.keyState === "unlocked" ? "Ready" : "Locked",
      tone: sessionData.keyState === "unlocked" ? "ready" : "action",
      count:
        passwordEnvelopeCount +
        unlockPasskeys.length +
        activeTrustedDevices.length +
        activeRecoveryKeys.length,
      Icon: KeyRound,
    },
    {
      id: "devices",
      label: "Trusted browsers",
      detail: "Approve encrypted access on a new browser",
      state: activeTrustedDevices.length ? `${activeTrustedDevices.length} trusted` : "Not set",
      tone: activeTrustedDevices.length ? "ready" : "action",
      count: activeTrustedDevices.length + pendingApprovals.length,
      Icon: Laptop,
    },
    {
      id: "recovery",
      label: "Recovery",
      detail: "Recover encrypted access when other methods are unavailable",
      state: activeRecoveryKeys.length || recoveryEnvelopes.length ? "Ready" : "Not set",
      tone: activeRecoveryKeys.length || recoveryEnvelopes.length ? "ready" : "action",
      count: activeRecoveryKeys.length || recoveryEnvelopes.length,
      Icon: LifeBuoy,
    },
    {
      id: "mfa",
      label: "Two-factor",
      detail: "Authenticator app codes",
      state: status?.enabled ? "Enabled" : "Optional",
      tone: status?.enabled ? "ready" : "neutral",
      count: status?.enabled ? 1 : 0,
      Icon: ShieldCheck,
    },
    {
      id: "advanced",
      label: "Advanced key records",
      detail: "Raw encrypted access records for troubleshooting",
      state: `${activeEnvelopes.length} records`,
      tone: "neutral",
      count: activeEnvelopes.length,
      Icon: SlidersHorizontal,
    },
  ];
  const recommendedAction = !activeRecoveryKeys.length
    ? "Create a recovery key"
    : activePasskeys.length === 0
      ? "Add a passkey"
      : activeTrustedDevices.length === 0 && unlockPolicy.allowTrustedDeviceApproval
        ? "Trust this browser"
        : null;
  const activeRow =
    activeSection === "overview"
      ? {
          label: "Overview",
          detail: "Recommended actions and security status",
          state: recommendedAction ? "Action needed" : "Ready",
          tone: recommendedAction ? ("action" as const) : ("ready" as const),
        }
      : securityRows.find((row) => row.id === activeSection);

  if (loading)
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );

  return (
    <div className={styles.settings}>
      {error && <div className="error-message">{error}</div>}
      <div className={styles.layout}>
        <nav className={styles.menu} aria-label="Security settings sections">
          <button
            type="button"
            className={cx(styles.menuItem, activeSection === "overview" && styles.menuItemActive)}
            onClick={() => setActiveSection("overview")}
            aria-pressed={activeSection === "overview"}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              <ListChecks size={18} />
            </span>
            <span className={styles.menuCopy}>
              <span>Overview</span>
              <small>Recommended actions and security status</small>
            </span>
            <StatusPill tone={recommendedAction ? "action" : "ready"}>
              {recommendedAction ? "Action" : "Ready"}
            </StatusPill>
          </button>
          {securityRows.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cx(styles.menuItem, activeSection === tab.id && styles.menuItemActive)}
              onClick={() => setActiveSection(tab.id)}
              aria-pressed={activeSection === tab.id}
            >
              <span className={styles.menuIcon} aria-hidden="true">
                <tab.Icon size={18} />
              </span>
              <span className={styles.menuCopy}>
                <span>{tab.label}</span>
                <small>{tab.detail}</small>
              </span>
              <StatusPill tone={tab.tone}>{tab.state}</StatusPill>
            </button>
          ))}
        </nav>
        <div className={styles.panel}>
          {activeRow ? (
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Security settings</p>
                <h3>
                  {activeSection === "overview" ? activeRow.label : `${activeRow.label} settings`}
                </h3>
                <p>{activeRow.detail}</p>
              </div>
              <StatusPill tone={activeRow.tone}>{activeRow.state}</StatusPill>
            </div>
          ) : null}
          {activeSection === "overview" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Security overview</h3>
                  <p>
                    Review the ways you sign in, unlock encrypted app access, and recover this
                    account.
                  </p>
                </div>
              </div>
              {recommendedAction && (
                <div className={styles.recommendation}>
                  <div>
                    <strong>{recommendedAction}</strong>
                    <p>
                      {recommendedAction === "Create a recovery key"
                        ? "A recovery key protects encrypted app access if you lose your password, passkey, or trusted browser."
                        : recommendedAction === "Add a passkey"
                          ? "Passkeys make sign-in easier and may also unlock encrypted app access on supported devices."
                          : "Trusted browsers can approve encrypted access when you sign in somewhere new."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className={styles.actionButton}
                    onClick={() =>
                      setActiveSection(
                        recommendedAction === "Create a recovery key"
                          ? "recovery"
                          : recommendedAction === "Add a passkey"
                            ? "passkeys"
                            : "devices"
                      )
                    }
                  >
                    Start
                  </Button>
                </div>
              )}
              <div className={styles.statusList}>
                {securityRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={styles.statusRow}
                    onClick={() => setActiveSection(row.id)}
                  >
                    <span className={styles.statusText}>
                      <strong>{row.label}</strong>
                      <small>{row.detail}</small>
                    </span>
                    <StatusPill tone={row.tone}>{row.state}</StatusPill>
                  </button>
                ))}
              </div>
            </section>
          )}
          {activeSection === "signin" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Sign-in Methods</h3>
                  <p>
                    Sign-in methods prove your identity. Encryption unlock methods are managed
                    separately.
                  </p>
                </div>
              </div>
              <div className={styles.itemList}>
                <article className={styles.item}>
                  <div>
                    <h4>Password sign-in</h4>
                    <p>
                      {sessionData.email
                        ? `Enabled for ${sessionData.email}.`
                        : "Available when this account has a DarkAuth email identity."}
                    </p>
                  </div>
                  <a className={styles.linkButton} href="/security/password">
                    Manage password
                  </a>
                </article>
                <article className={styles.item}>
                  <div>
                    <h4>Enterprise SSO</h4>
                    <p>
                      {enterpriseSsoRoute
                        ? `${enterpriseSsoRoute.name} routes sign-ins for this email domain.`
                        : "No enterprise SSO route is advertised for your email domain."}
                    </p>
                  </div>
                </article>
                <article className={styles.item}>
                  <div>
                    <h4>Connected identities</h4>
                    {connectedIdentityCount > 0 ? (
                      <div className={styles.identityList}>
                        {connectedIdentities.map((identity) => {
                          const connectionName =
                            identity.connectionName || identity.connection_name;
                          const externalSubject =
                            identity.externalSubject || identity.external_subject;
                          const emailVerified = identity.emailVerified ?? identity.email_verified;
                          return (
                            <p key={identity.id}>
                              {connectionName || identity.issuer || "Enterprise identity"}
                              {identity.email ? ` · ${identity.email}` : ""}
                              {emailVerified ? " · verified email" : ""}
                              {externalSubject ? ` · Subject ${externalSubject}` : ""}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p>
                        Connected enterprise identities appear here after a successful SSO sign-in.
                      </p>
                    )}
                  </div>
                </article>
              </div>
            </section>
          )}
          {activeSection === "passkeys" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Passkeys</h3>
                  <p>
                    Add a passkey for faster sign-in. If your browser and authenticator support
                    passkey unlock, DarkAuth will also use it for encrypted app access.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className={styles.actionButton}
                  onClick={registerPasskey}
                  disabled={!passkeyCompatibility?.webauthn || passkeyActionLoading}
                >
                  {passkeyActionLoading ? "Creating..." : "Create passkey"}
                </Button>
              </div>
              <div className={styles.inlineStats}>
                <span>Sign-in and encrypted access: {unlockPasskeys.length}</span>
                <span>Sign-in only: {authOnlyPasskeys.length}</span>
              </div>
              <details className={styles.details}>
                <summary>Compatibility details</summary>
                <p>
                  {passkeyCompatibility?.webauthn
                    ? "This browser supports passkey sign-in."
                    : "This browser does not appear to support passkey sign-in."}{" "}
                  {passkeyCompatibility?.platformAuthenticator
                    ? "A platform authenticator is available."
                    : "Use a compatible security key or platform authenticator."}
                  {passkeyCompatibility?.conditionalMediation
                    ? " Conditional passkey prompts are available."
                    : ""}
                </p>
                <p>
                  PRF unlock support is confirmed during setup with the chosen authenticator. If PRF
                  is unavailable, use password unlock, a recovery key, or trusted-device approval.
                </p>
                {!unlockPolicy.allowPasskeyPrfEnvelope && (
                  <p>
                    Your organization allows passkey sign-in but disables passkey encryption unlock
                    setup.
                  </p>
                )}
              </details>
              {passkeyMessage && <div className={styles.notice}>{passkeyMessage}</div>}
              {activePasskeys.length > 0 ? (
                <div className={styles.itemList}>
                  {activePasskeys.map((passkey) => (
                    <article className={styles.item} key={passkey.credential_id}>
                      <div>
                        <h4>{passkey.label || "Passkey"}</h4>
                        <p>
                          {passkey.can_unlock
                            ? "Signs you in and unlocks encrypted apps"
                            : "Signs you in only"}{" "}
                          · Last used {formatDate(passkey.last_used_at)} · Added{" "}
                          {formatDate(passkey.created_at)}
                        </p>
                        {passkey.transports && passkey.transports.length > 0 && (
                          <p>{passkey.transports.join(", ")}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (window.confirm("Remove this passkey from your account?")) {
                            void revokePasskey(passkey.credential_id);
                          }
                        }}
                        disabled={passkeyRevokeLoading === passkey.credential_id}
                      >
                        Revoke
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>No passkeys are registered for this account.</div>
              )}
            </section>
          )}
          {activeSection === "unlock" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Encrypted App Access</h3>
                  <p>
                    You can be signed in while encrypted app access is still locked. Add more than
                    one unlock method so zero-knowledge apps stay reachable.
                  </p>
                </div>
              </div>
              <div className={styles.inlineStats}>
                <span>Password unlock: {passwordEnvelopeCount ? "Ready" : "Not set"}</span>
                <span>Passkey unlock: {unlockPasskeys.length}</span>
                <span>Trusted browsers: {activeTrustedDevices.length}</span>
                <span>Recovery keys: {activeRecoveryKeys.length || recoveryEnvelopes.length}</span>
              </div>
              {unlockPolicy.managed && (
                <details className={styles.details}>
                  <summary>Organization policy</summary>
                  <p>
                    Your organization manages allowed unlock methods. Password envelopes{" "}
                    {unlockPolicy.allowPasswordEnvelope ? "are allowed" : "are disabled"}, PRF
                    passkey envelopes{" "}
                    {unlockPolicy.allowPasskeyPrfEnvelope ? "are allowed" : "are disabled"}, and
                    trusted-device approval{" "}
                    {unlockPolicy.allowTrustedDeviceApproval ? "is allowed" : "is disabled"}.
                  </p>
                </details>
              )}
              <div className={styles.itemList}>
                <article className={styles.item}>
                  <div>
                    <h4>Password unlock</h4>
                    <p>
                      {passwordEnvelopeCount
                        ? "Your password can unlock encrypted app access."
                        : "No password unlock record is available."}
                    </p>
                  </div>
                  <a className={styles.linkButton} href="/security/password">
                    Manage password
                  </a>
                </article>
                <article className={styles.item}>
                  <div>
                    <h4>Passkey unlock</h4>
                    <p>
                      {unlockPasskeys.length
                        ? `${unlockPasskeys.length} passkey can unlock encrypted apps.`
                        : "Add a compatible passkey to unlock encrypted apps without typing a password."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className={styles.actionButton}
                    onClick={() => setActiveSection("passkeys")}
                  >
                    Manage passkeys
                  </Button>
                </article>
                <article className={styles.item}>
                  <div>
                    <h4>Trusted browsers</h4>
                    <p>
                      {activeTrustedDevices.length
                        ? `${activeTrustedDevices.length} browser can approve new encrypted access requests.`
                        : "Trust this browser after unlocking encrypted access."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className={styles.actionButton}
                    onClick={() => setActiveSection("devices")}
                  >
                    Manage browsers
                  </Button>
                </article>
              </div>
            </section>
          )}
          {activeSection === "recovery" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Recovery Key</h3>
                  <p>
                    Create a recovery key, save it somewhere safe, then confirm it is saved before
                    leaving this screen.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className={styles.actionButton}
                  onClick={createRecoveryKey}
                  disabled={recoveryActionLoading === "create"}
                >
                  {activeRecoveryKeys.length > 0 ? "Rotate recovery key" : "Create recovery key"}
                </Button>
              </div>
              <div className={styles.notice}>
                {activeRecoveryKeys.length > 0 || recoveryEnvelopes.length > 0
                  ? "A recovery key is registered for this account."
                  : "No recovery key is registered for this account."}
              </div>
              {recoverySecret && (
                <div className={styles.secretBox}>
                  <p>Save this recovery key now. It will not be shown again.</p>
                  <code>{recoverySecret}</code>
                  <label className={styles.confirmSaved}>
                    <input
                      type="checkbox"
                      checked={recoverySecretSaved}
                      onChange={(event) => setRecoverySecretSaved(event.target.checked)}
                    />
                    <span>I saved this recovery key somewhere safe.</span>
                  </label>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(recoverySecret);
                        } catch {}
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!recoverySecretSaved}
                      onClick={() => setRecoverySecret(null)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
              {activeRecoveryKeys.length > 0 && (
                <div className={styles.itemList}>
                  {activeRecoveryKeys.map((recoveryKey) => (
                    <article className={styles.item} key={recoveryKey.recovery_key_id}>
                      <div>
                        <h4>{recoveryKey.label || "Recovery key"}</h4>
                        <p>
                          Last used {formatDate(recoveryKey.last_used_at)} · Added{" "}
                          {formatDate(recoveryKey.created_at)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (window.confirm("Revoke this recovery key? It will stop working.")) {
                            void revokeRecoveryKey(recoveryKey.recovery_key_id);
                          }
                        }}
                        disabled={recoveryActionLoading === recoveryKey.recovery_key_id}
                      >
                        Revoke
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeSection === "devices" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Trusted Browsers</h3>
                  <p>Trusted browsers can approve encrypted app access for a new browser.</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className={styles.actionButton}
                  onClick={trustCurrentDevice}
                  disabled={
                    trustDeviceLoading ||
                    sessionData.keyState !== "unlocked" ||
                    !unlockPolicy.allowTrustedDeviceApproval
                  }
                >
                  {trustDeviceLoading ? "Trusting..." : "Trust this browser"}
                </Button>
              </div>
              {sessionData.keyState !== "unlocked" && (
                <div className={styles.notice}>
                  Unlock encryption keys before trusting this browser.
                </div>
              )}
              {sessionData.keyState === "unlocked" && (
                <div className={styles.notice}>
                  This browser is ready to become trusted for future encrypted access approvals.
                </div>
              )}
              {!unlockPolicy.allowTrustedDeviceApproval && (
                <div className={styles.notice}>
                  Your organization disabled trusted-device approval setup.
                </div>
              )}
              {trustedDeviceMessage && <div className={styles.notice}>{trustedDeviceMessage}</div>}
              {activeTrustedDevices.length > 0 ? (
                <div className={styles.itemList}>
                  {activeTrustedDevices.map((device) => (
                    <article className={styles.item} key={device.device_id}>
                      <div>
                        <h4>{device.label || "Trusted device"}</h4>
                        <p>
                          Last used {formatDate(device.last_used_at)} · Added{" "}
                          {formatDate(device.created_at)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => revokeTrustedDevice(device.device_id)}
                        disabled={deviceActionLoading === device.device_id}
                      >
                        Revoke
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  No trusted browsers are registered for this account.
                </div>
              )}
              <div className={styles.divider} />
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Pending Device Approvals</h3>
                  <p>
                    Approve only requests that show the same verification code on the new device.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className={styles.actionButton}
                  onClick={refreshDeviceApprovals}
                  disabled={!!deviceActionLoading}
                >
                  Refresh approvals
                </Button>
              </div>
              {pendingApprovals.length > 0 ? (
                <div className={styles.itemList}>
                  {pendingApprovals.map((approval) => (
                    <article className={styles.item} key={approval.request_id}>
                      <div>
                        <h4>{approval.client_id || "New device request"}</h4>
                        <p>
                          Code {approval.verification_code || "shown on the new device"} · Expires{" "}
                          {formatDate(approval.expires_at)}
                        </p>
                      </div>
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          variant="success"
                          onClick={() => approveApproval(approval)}
                          disabled={deviceActionLoading === approval.request_id}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => denyApproval(approval.request_id)}
                          disabled={deviceActionLoading === approval.request_id}
                        >
                          Deny
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>No device approvals are waiting.</div>
              )}
            </section>
          )}
          {activeSection === "mfa" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Two-Factor Authentication</h3>
                  <p>Use an authenticator app and backup codes for account sign-in protection.</p>
                </div>
                {status?.enabled && status.verified && (
                  <Button type="button" variant="secondary" onClick={doResetup}>
                    Replace authenticator app
                  </Button>
                )}
              </div>
              {!status?.enabled && !provisioningUri && (
                <Button type="button" variant="primary" onClick={doResetup}>
                  Start Setup
                </Button>
              )}
              {(provisioningUri || (status?.enabled && !status.verified)) && (
                <div className={styles.setupBox}>
                  <p>Scan the QR code, then enter the 6-digit code from your authenticator app.</p>
                  {provisioningUri && <canvas ref={qrCanvasRef} width={192} height={192} />}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowManual((v) => !v)}
                  >
                    {showManual ? "Hide secret" : "Can't scan? Show secret"}
                  </Button>
                  {showManual && secret && (
                    <div className={styles.secretBox}>
                      <code>{secret}</code>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(secret);
                          } catch {}
                        }}
                      >
                        Copy secret
                      </Button>
                    </div>
                  )}
                  <input
                    value={code}
                    onChange={(event) => {
                      const cleaned = event.target.value
                        .replace(/[^0-9A-Za-z-]/g, "")
                        .toUpperCase();
                      setCode(cleaned.slice(0, 14));
                    }}
                    placeholder="123456"
                    className={styles.codeInput}
                    maxLength={14}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={doSetupVerify}
                    disabled={code.replace(/-/g, "").length !== 6}
                  >
                    Verify
                  </Button>
                </div>
              )}
              {status?.enabled && status.verified && (
                <div className={styles.notice}>Two-factor authentication is enabled.</div>
              )}
              {backupCodes && backupCodes.length > 0 && (
                <div className={styles.secretBox}>
                  <h4>Your Backup Codes</h4>
                  <p>Store these codes securely. Each can be used once.</p>
                  <div className={styles.codeGrid}>
                    {backupCodes.map((backupCode) => (
                      <code key={backupCode}>{backupCode}</code>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(backupCodes.join("\n"));
                        } catch {}
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "backup-codes.txt";
                        document.body.appendChild(a);
                        a.click();
                        URL.revokeObjectURL(url);
                        a.remove();
                      }}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
          {activeSection === "advanced" && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Advanced Key Records</h3>
                  <p>
                    These encrypted records are used to unlock zero-knowledge app access. Most
                    people never need to manage them directly.
                  </p>
                </div>
              </div>
              {activeEnvelopes.length > 0 ? (
                <div className={styles.itemList}>
                  {activeEnvelopes.map((envelope) => (
                    <article className={styles.item} key={envelope.envelope_id}>
                      <div>
                        <h4>{envelope.label || envelope.type}</h4>
                        <p>
                          {envelope.type} · {envelope.wrapping_alg}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => revokeEnvelope(envelope.envelope_id)}
                      >
                        Revoke
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  No advanced key records are registered for this account.
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
