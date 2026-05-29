import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import api, {
  type DeviceApprovalResponse,
  type KeybagResponse,
  type RecoveryKeyResponse,
  type TrustedDeviceResponse,
} from "../services/api";
import cryptoService, { fromBase64Url, toBase64Url } from "../services/crypto";
import deviceKeyStore from "../services/deviceKeyStore";
import { loadExportKey } from "../services/sessionKey";
import { loadUnlockedArk, saveUnlockedArk } from "../services/unlockedArk";
import {
  createPasskeyCredential,
  derivePasskeyPrfWrapKey,
  getPasskeyPrfResult,
  passkeyPrfEnabled,
  serializeRegistrationResponse,
} from "../services/webauthn";
import Button from "./Button";

export default function SettingsSecurity({
  sessionData,
}: {
  sessionData: { sub: string; email?: string };
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
    backup_codes_remaining?: number;
    required?: boolean;
  } | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [keybag, setKeybag] = useState<KeybagResponse | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceResponse[]>([]);
  const [deviceApprovals, setDeviceApprovals] = useState<DeviceApprovalResponse[]>([]);
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);
  const [trustDeviceLoading, setTrustDeviceLoading] = useState(false);
  const [recoveryKeys, setRecoveryKeys] = useState<RecoveryKeyResponse[]>([]);
  const [recoverySecret, setRecoverySecret] = useState<string | null>(null);
  const [recoveryActionLoading, setRecoveryActionLoading] = useState<string | null>(null);
  const [passkeyActionLoading, setPasskeyActionLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [passkeyCompatibility, setPasskeyCompatibility] = useState<{
    webauthn: boolean;
    platformAuthenticator: boolean | null;
    conditionalMediation: boolean | null;
  } | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showManual, setShowManual] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBackupCodes(null);
      const [s, keys, devices, approvals, recovery] = await Promise.all([
        api.getOtpStatus(),
        api.getKeybag().catch(() => null),
        api.getTrustedDevices(),
        api.getDeviceApprovals(),
        api.getRecoveryKeys().catch(() => []),
      ]);
      setStatus(s);
      setKeybag(keys);
      setTrustedDevices(devices);
      setDeviceApprovals(approvals);
      setRecoveryKeys(recovery);
      setProvisioningUri(null);
      setSecret(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load security settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  const getUnlockedArk = async () => {
    const existing = loadUnlockedArk(sessionData.sub);
    if (existing) return existing;
    const exportKey = await loadExportKey(sessionData.sub);
    if (!exportKey) return null;
    try {
      const wrappedDrk = fromBase64Url(await api.getWrappedDrk());
      const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      try {
        const ark = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
        saveUnlockedArk(sessionData.sub, ark);
        return ark;
      } finally {
        cryptoService.clearSensitiveData(keys.masterKey, keys.wrapKey, keys.deriveKey);
      }
    } finally {
      cryptoService.clearSensitiveData(exportKey);
    }
  };

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
      if (finish.credential.prf_supported && passkeyPrfEnabled(credential) && prfResult) {
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
      } else {
        setPasskeyMessage(
          "Passkey registered for sign-in. This authenticator did not return PRF unlock material."
        );
      }
      setKeybag(await api.getKeybag().catch(() => null));
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

  const createRecoveryKey = async () => {
    let exportKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    let keys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    let secretBytes: Uint8Array | null = null;
    let recoveryWrapKey: Uint8Array | null = null;
    let verifier: Uint8Array | null = null;
    let wrappedKey: Uint8Array | null = null;
    try {
      setRecoveryActionLoading("create");
      setRecoverySecret(null);
      setError(null);
      exportKey = await loadExportKey(sessionData.sub);
      if (!exportKey) {
        throw new Error("Unlock this browser with your password before creating a recovery key.");
      }
      const keyId = await getOrCreateAccountKeyId();
      const wrappedDrk = fromBase64Url(await api.getWrappedDrk());
      keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      ark = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
      secretBytes = new Uint8Array(32);
      crypto.getRandomValues(secretBytes);
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
      const arraysToClear = [
        exportKey,
        ark,
        keys?.masterKey,
        keys?.wrapKey,
        keys?.deriveKey,
        secretBytes,
        recoveryWrapKey,
        verifier,
        wrappedKey,
      ].filter((value): value is Uint8Array => value instanceof Uint8Array);
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
    let exportKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    let keys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    let wrappedKey: Uint8Array | null = null;
    let handle: string | null = null;
    try {
      setTrustDeviceLoading(true);
      setError(null);
      exportKey = await loadExportKey(sessionData.sub);
      if (!exportKey) {
        throw new Error("Unlock this browser with your password before trusting this device.");
      }
      const keyId = await getOrCreateAccountKeyId();
      const wrappedDrk = fromBase64Url(await api.getWrappedDrk());
      keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      ark = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
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
        publicKeyJwk: { kty: "local", kid: handle } as JsonWebKey,
        keyHandle: handle,
        envelopeId,
      });
      const [keysAfterTrust, devicesAfterTrust] = await Promise.all([
        api.getKeybag(),
        api.getTrustedDevices(),
      ]);
      setKeybag(keysAfterTrust);
      setTrustedDevices(devicesAfterTrust);
    } catch (e) {
      if (handle) {
        await deviceKeyStore.deleteKey(handle).catch(() => {});
      }
      setError(e instanceof Error ? e.message : "Failed to trust this device");
    } finally {
      const arraysToClear = [
        exportKey,
        ark,
        keys?.masterKey,
        keys?.wrapKey,
        keys?.deriveKey,
        wrappedKey,
      ].filter((value): value is Uint8Array => value instanceof Uint8Array);
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
      setDeviceApprovals(await api.getDeviceApprovals());
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
    const approvingDevice = trustedDevices.find((device) => !device.revoked_at);
    if (!approvingDevice) {
      setError("No trusted device is available to approve this request.");
      return;
    }

    let exportKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    let keys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
    try {
      setDeviceActionLoading(requestId);
      setError(null);
      exportKey = await loadExportKey(sessionData.sub);
      if (!exportKey) {
        throw new Error("Unlock this browser with your password before approving another device.");
      }
      const wrappedDrk = fromBase64Url(await api.getWrappedDrk());
      keys = await cryptoService.deriveKeysFromExportKey(exportKey, sessionData.sub);
      ark = await cryptoService.unwrapDRK(wrappedDrk, keys.wrapKey, sessionData.sub);
      const encryptedApproval = await cryptoService.createDeviceApprovalJWE(
        ark,
        recipientPublicJwk,
        {
          sub: sessionData.sub,
          requestId,
        }
      );
      await api.approveDeviceApproval(requestId, {
        encryptedApproval,
        approvedDeviceId: approvingDevice.device_id,
      });
      setDeviceApprovals(await api.getDeviceApprovals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve device");
    } finally {
      const arraysToClear = [
        exportKey,
        ark,
        keys?.masterKey,
        keys?.wrapKey,
        keys?.deriveKey,
      ].filter((value): value is Uint8Array => value instanceof Uint8Array);
      if (arraysToClear.length > 0) {
        cryptoService.clearSensitiveData(...arraysToClear);
      }
      setDeviceActionLoading(null);
    }
  };

  const activeTrustedDevices = trustedDevices.filter((device) => !device.revoked_at);
  const activeEnvelopes = keybag?.envelopes.filter((envelope) => !envelope.revoked_at) ?? [];
  const passkeyPrfEnvelopes = activeEnvelopes.filter((envelope) => envelope.type === "passkey_prf");
  const recoveryEnvelopes = activeEnvelopes.filter((envelope) => envelope.type === "recovery");
  const activeRecoveryKeys = recoveryKeys.filter((key) => !key.revoked_at);
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

  if (loading)
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      {error && <div className="error-message">{error}</div>}
      {!status?.enabled && (
        <div className="form-group">
          <h3>Enable Two-Factor Authentication</h3>
          {!provisioningUri ? (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button type="button" variant="primary" onClick={doResetup}>
                Start Setup
              </Button>
            </div>
          ) : (
            <>
              <div className="help-text">Scan the QR or use the URI below.</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 16,
                  marginBottom: 20,
                }}
              >
                <canvas
                  ref={qrCanvasRef}
                  width={192}
                  height={192}
                  style={{ background: "#fff", borderRadius: 8 }}
                />
                <Button type="button" variant="secondary" onClick={() => setShowManual((v) => !v)}>
                  {showManual ? "Hide secret" : "Can't scan? Show secret"}
                </Button>
                {showManual && secret && (
                  <div style={{ maxWidth: 420, width: "100%" }}>
                    <div
                      style={{
                        wordBreak: "break-all",
                        background: "hsl(var(--muted))",
                        padding: 8,
                        borderRadius: 6,
                        textAlign: "center",
                        fontFamily: "monospace",
                      }}
                    >
                      {secret}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
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
                  </div>
                )}
              </div>
              <div className="help-text">Enter the 6-digit code to verify:</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="form-input"
                style={{ width: 192, margin: "8px auto 10px" }}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <div style={{ width: 192, margin: "0 auto" }}>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  onClick={doSetupVerify}
                  disabled={code.length !== 6}
                >
                  Verify
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {status?.enabled && !status.verified && (
        <div className="form-group">
          <h3>Complete Verification</h3>
          <div className="help-text">
            Scan the QR or enter a code from your app or a backup code.
          </div>
          {provisioningUri && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                marginTop: 16,
                marginBottom: 20,
              }}
            >
              <canvas
                ref={qrCanvasRef}
                width={192}
                height={192}
                style={{ background: "#fff", borderRadius: 8 }}
              />
              <Button type="button" variant="secondary" onClick={() => setShowManual((v) => !v)}>
                {showManual ? "Hide secret" : "Can't scan? Show secret"}
              </Button>
              {showManual && secret && (
                <div style={{ maxWidth: 420, width: "100%" }}>
                  <div
                    style={{
                      wordBreak: "break-all",
                      background: "hsl(var(--muted))",
                      padding: 8,
                      borderRadius: 6,
                      textAlign: "center",
                      fontFamily: "monospace",
                    }}
                  >
                    {secret}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
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
                </div>
              )}
            </div>
          )}
          {!provisioningUri && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={doResetup}>
                Generate new QR
              </Button>
            </div>
          )}
          <div className="help-text" style={{ textAlign: "center" }}>
            You can enter either the one time token from your authenticator or a backup code.
          </div>
          <input
            value={code}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
              setCode(cleaned.slice(0, 14));
            }}
            placeholder="Enter One Time Code"
            className="form-input"
            style={{
              width: 240,
              margin: "8px auto 10px",
              textAlign: "center",
              fontSize: 24,
              letterSpacing: 6,
            }}
            maxLength={14}
          />
          <div style={{ width: 192, margin: "0 auto" }}>
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={doSetupVerify}
              disabled={code.replace(/-/g, "").length !== 6}
            >
              Verify
            </Button>
          </div>
        </div>
      )}
      {status?.enabled && status.verified && (
        <div className="form-footer">
          <div className="actions">
            <Button type="button" variant="primary" onClick={doResetup}>
              Resetup OTP
            </Button>
          </div>
        </div>
      )}
      <div className="form-group" style={{ marginTop: 24, textAlign: "left" }}>
        <h3>Passkeys</h3>
        <div className="help-text">
          Passkeys can sign you in. Only passkeys with verified WebAuthn PRF support can also unlock
          encrypted app keys.
        </div>
        <div className="help-text" style={{ marginTop: 8 }}>
          {passkeyCompatibility?.webauthn
            ? "This browser supports passkey sign-in."
            : "This browser does not appear to support passkey sign-in."}{" "}
          {passkeyCompatibility?.platformAuthenticator
            ? "A platform authenticator is available."
            : "Use a compatible security key or platform authenticator."}
          {passkeyCompatibility?.conditionalMediation
            ? " Conditional passkey prompts are available."
            : ""}
        </div>
        <div className="help-text" style={{ marginTop: 8 }}>
          PRF unlock support is confirmed during setup with the chosen authenticator. If PRF is
          unavailable, use password unlock, a recovery key, or trusted-device approval.
        </div>
        <div className="help-text" style={{ marginTop: 12 }}>
          Auth + unlock passkeys: {passkeyPrfEnvelopes.length}. Auth-only passkeys are sign-in
          methods, not encryption unlock methods.
        </div>
        {passkeyMessage && (
          <div className="help-text" style={{ marginTop: 8 }}>
            {passkeyMessage}
          </div>
        )}
        <div style={{ display: "flex", marginTop: 12 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={registerPasskey}
            disabled={!passkeyCompatibility?.webauthn || passkeyActionLoading}
          >
            {passkeyActionLoading ? "Creating passkey..." : "Create passkey"}
          </Button>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 24, textAlign: "left" }}>
        <h3>Encryption Keys</h3>
        <div className="help-text">
          These records are encrypted key envelopes. Revoking one removes that unlock method.
        </div>
        {keybag && keybag.envelopes.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {keybag.envelopes.map((envelope) => (
              <li
                key={envelope.envelope_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid hsl(var(--border))",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{envelope.label || envelope.type}</div>
                  <div className="help-text">
                    {envelope.type} · {envelope.wrapping_alg}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => revokeEnvelope(envelope.envelope_id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="help-text" style={{ marginTop: 12 }}>
            No key envelopes are registered for this account.
          </div>
        )}
      </div>
      <div className="form-group" style={{ marginTop: 24, textAlign: "left" }}>
        <h3>Recovery Key</h3>
        <div className="help-text">
          A recovery key can unlock encrypted app access after sign-in if other unlock methods are
          unavailable.
        </div>
        <div className="help-text" style={{ marginTop: 8 }}>
          {activeRecoveryKeys.length > 0 || recoveryEnvelopes.length > 0
            ? "A recovery key is registered for this account."
            : "No recovery key is registered for this account."}
        </div>
        {recoverySecret && (
          <div style={{ marginTop: 12 }}>
            <div className="help-text">Save this recovery key now. It will not be shown again.</div>
            <div
              style={{
                wordBreak: "break-all",
                background: "hsl(var(--muted))",
                padding: 8,
                borderRadius: 6,
                fontFamily: "monospace",
                marginTop: 8,
              }}
            >
              {recoverySecret}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
              <Button type="button" variant="secondary" onClick={() => setRecoverySecret(null)}>
                Hide
              </Button>
            </div>
          </div>
        )}
        {activeRecoveryKeys.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {activeRecoveryKeys.map((recoveryKey) => (
              <li
                key={recoveryKey.recovery_key_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid hsl(var(--border))",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{recoveryKey.label || "Recovery key"}</div>
                  <div className="help-text">
                    Last used {formatDate(recoveryKey.last_used_at)} · Added{" "}
                    {formatDate(recoveryKey.created_at)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => revokeRecoveryKey(recoveryKey.recovery_key_id)}
                  disabled={recoveryActionLoading === recoveryKey.recovery_key_id}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={createRecoveryKey}
            disabled={recoveryActionLoading === "create"}
          >
            {activeRecoveryKeys.length > 0 ? "Rotate recovery key" : "Create recovery key"}
          </Button>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 24, textAlign: "left" }}>
        <h3>Trusted Devices</h3>
        <div className="help-text">
          Trusted devices can approve encrypted key access for a new browser without exposing keys
          to the server.
        </div>
        <div className="help-text" style={{ marginTop: 8 }}>
          This browser stores only a local key handle; DarkAuth stores the encrypted envelope.
        </div>
        <div style={{ display: "flex", marginTop: 12 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={trustCurrentDevice}
            disabled={trustDeviceLoading}
          >
            Trust this browser
          </Button>
        </div>
        {activeTrustedDevices.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {activeTrustedDevices.map((device) => (
              <li
                key={device.device_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid hsl(var(--border))",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{device.label || "Trusted device"}</div>
                  <div className="help-text">
                    Last used {formatDate(device.last_used_at)} · Added{" "}
                    {formatDate(device.created_at)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => revokeTrustedDevice(device.device_id)}
                  disabled={deviceActionLoading === device.device_id}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="help-text" style={{ marginTop: 12 }}>
            No trusted devices are registered for this account.
          </div>
        )}
      </div>
      <div className="form-group" style={{ marginTop: 24, textAlign: "left" }}>
        <h3>Pending Device Approvals</h3>
        <div className="help-text">
          Approve only requests that show the same verification code on the new device.
        </div>
        {pendingApprovals.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {pendingApprovals.map((approval) => (
              <li
                key={approval.request_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid hsl(var(--border))",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {approval.client_id || "New device request"}
                  </div>
                  <div className="help-text">
                    Code {approval.verification_code || "shown on the new device"} · Expires{" "}
                    {formatDate(approval.expires_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
              </li>
            ))}
          </ul>
        ) : (
          <div className="help-text" style={{ marginTop: 12 }}>
            No device approvals are waiting.
          </div>
        )}
      </div>
      {backupCodes && backupCodes.length > 0 && (
        <div className="form-group">
          <h3>Your Backup Codes</h3>
          <div className="help-text">Store these codes securely. Each can be used once.</div>
          <ul>
            {backupCodes.map((c) => (
              <li key={c} style={{ fontFamily: "monospace" }}>
                {c}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const content = backupCodes.join("\n");
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(
                    `<pre>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`
                  );
                  w.document.close();
                  w.focus();
                  w.print();
                }
              }}
            >
              Print
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
