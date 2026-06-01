import { useCallback, useEffect, useId, useRef, useState } from "react";
import api, {
  type DeviceApprovalResponse,
  type KeyEnvelopeResponse,
  type SessionResponse,
} from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url } from "../services/crypto";
import deviceKeyStore from "../services/deviceKeyStore";
import opaqueService from "../services/opaque";
import { loadExportKey, saveExportKey } from "../services/sessionKey";
import { loadUnlockedArk, saveUnlockedArk } from "../services/unlockedArk";
import {
  defaultUnlockPolicy,
  isUnlockMethodAllowed,
  type UnlockPolicy,
} from "../services/unlockPolicy";
import Button from "./Button";
import styles from "./KeyUnlockPanel.module.css";

interface KeyUnlockPanelProps {
  sub: string;
  email?: string | null;
  inline?: boolean;
  onUnlocked?: (session: SessionResponse | null) => void;
}

const textEncoder = new TextEncoder();

async function deriveV2PasswordWrapKey(exportKey: Uint8Array, sub: string): Promise<Uint8Array> {
  const salt = new Uint8Array(
    await crypto.subtle.digest("SHA-256", textEncoder.encode(`DarkAuth|v2|password|sub=${sub}`))
  );
  const masterKey = await cryptoService.hkdf(exportKey, salt, textEncoder.encode("mk"), 32);
  try {
    return await cryptoService.hkdf(
      masterKey,
      textEncoder.encode("DarkAuth|v2"),
      textEncoder.encode("account-root-wrap"),
      32
    );
  } finally {
    cryptoService.clearSensitiveData(masterKey);
  }
}

function normalizeArk(unwrapped: Uint8Array, envelope?: KeyEnvelopeResponse): Uint8Array {
  if (unwrapped.length === 32) return new Uint8Array(unwrapped);
  const decoded = new TextDecoder().decode(unwrapped);
  const parsed = JSON.parse(decoded) as {
    typ?: string;
    version?: string;
    sub?: string;
    key_id?: string;
    ark?: string;
  };
  if (
    parsed.typ !== "DarkAuth-Account-Root-Key" ||
    parsed.version !== "v2" ||
    !parsed.ark ||
    (envelope && (parsed.sub !== envelope.sub || parsed.key_id !== envelope.key_id))
  ) {
    throw new Error("Invalid password envelope plaintext");
  }
  const ark = fromBase64Url(parsed.ark);
  if (ark.length !== 32) throw new Error("Invalid account root key length");
  return ark;
}

async function unwrapPasswordEnvelopeWithKey(
  envelope: KeyEnvelopeResponse,
  exportKey: Uint8Array
): Promise<Uint8Array> {
  let v2WrapKey: Uint8Array | null = null;
  let legacyKeys: Awaited<ReturnType<typeof cryptoService.deriveKeysFromExportKey>> | null = null;
  try {
    v2WrapKey = await deriveV2PasswordWrapKey(exportKey, envelope.sub);
    const unwrapped = await cryptoService.unwrapKeyMaterial(
      fromBase64Url(envelope.wrapped_key),
      v2WrapKey,
      fromBase64Url(envelope.aad)
    );
    try {
      return normalizeArk(unwrapped, envelope);
    } finally {
      cryptoService.clearSensitiveData(unwrapped);
    }
  } catch (firstError) {
    try {
      legacyKeys = await cryptoService.deriveKeysFromExportKey(exportKey, envelope.sub);
      const unwrapped = await cryptoService.unwrapKeyMaterial(
        fromBase64Url(envelope.wrapped_key),
        legacyKeys.wrapKey,
        fromBase64Url(envelope.aad)
      );
      try {
        return normalizeArk(unwrapped, envelope);
      } finally {
        cryptoService.clearSensitiveData(unwrapped);
      }
    } catch {
      throw firstError;
    }
  } finally {
    const arraysToClear = [
      v2WrapKey,
      legacyKeys?.masterKey,
      legacyKeys?.wrapKey,
      legacyKeys?.deriveKey,
    ].filter((value): value is Uint8Array => value instanceof Uint8Array);
    if (arraysToClear.length > 0) cryptoService.clearSensitiveData(...arraysToClear);
  }
}

export async function unlockArkWithExportKey(
  sub: string,
  exportKey: Uint8Array
): Promise<Uint8Array> {
  const keybag = await api.getKeybag().catch(() => null);
  const passwordEnvelope = keybag?.envelopes.find(
    (envelope) => envelope.sub === sub && !envelope.revoked_at && envelope.type === "password"
  );
  if (passwordEnvelope) {
    return unwrapPasswordEnvelopeWithKey(passwordEnvelope, exportKey);
  }
  const legacyKeys = await cryptoService.deriveKeysFromExportKey(exportKey, sub);
  try {
    return await cryptoService.unwrapDRK(
      fromBase64Url(await api.getWrappedDrk()),
      legacyKeys.wrapKey,
      sub
    );
  } finally {
    cryptoService.clearSensitiveData(
      legacyKeys.masterKey,
      legacyKeys.wrapKey,
      legacyKeys.deriveKey
    );
  }
}

export async function unlockArkWithLocalTrustedDevice(sub: string): Promise<Uint8Array | null> {
  const [keybag, devices] = await Promise.all([
    api.getKeybag().catch(() => null),
    api.getTrustedDevices().catch(() => []),
  ]);
  const handleByEnvelopeId = new Map<string, string>();
  for (const device of devices) {
    if (device.sub && device.sub !== sub) continue;
    const metadataHandle = device.key_handle_metadata?.key_handle;
    const handle =
      device.key_handle || (typeof metadataHandle === "string" ? metadataHandle : null);
    if (!device.revoked_at && device.envelope_id && handle) {
      handleByEnvelopeId.set(device.envelope_id, handle);
    }
  }
  for (const envelope of keybag?.envelopes ?? []) {
    if (envelope.sub !== sub || envelope.revoked_at || envelope.type !== "trusted_device") continue;
    const metadata = envelope.metadata || {};
    const handle =
      typeof metadata.key_handle === "string"
        ? metadata.key_handle
        : typeof metadata.handle === "string"
          ? metadata.handle
          : handleByEnvelopeId.get(envelope.envelope_id) || null;
    if (!handle) continue;
    const localKey = await deviceKeyStore.getKey(handle).catch(() => null);
    if (!localKey) continue;
    const unwrapped = await cryptoService.unwrapKeyMaterialWithAesKey(
      fromBase64Url(envelope.wrapped_key),
      localKey,
      fromBase64Url(envelope.aad)
    );
    try {
      return normalizeArk(unwrapped, envelope);
    } finally {
      cryptoService.clearSensitiveData(unwrapped);
    }
  }
  return null;
}

export async function loadArkFromAvailableLocalUnlocks(sub: string): Promise<Uint8Array | null> {
  const existing = loadUnlockedArk(sub);
  if (existing) return existing;
  const trustedArk = await unlockArkWithLocalTrustedDevice(sub);
  if (trustedArk) {
    saveUnlockedArk(sub, trustedArk);
    return trustedArk;
  }
  const exportKey = await loadExportKey(sub);
  if (!exportKey) return null;
  try {
    const ark = await unlockArkWithExportKey(sub, exportKey);
    saveUnlockedArk(sub, ark);
    return ark;
  } finally {
    cryptoService.clearSensitiveData(exportKey);
  }
}

export default function KeyUnlockPanel({
  sub,
  email,
  inline = false,
  onUnlocked,
}: KeyUnlockPanelProps) {
  const passwordId = useId();
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlockPolicy, setUnlockPolicy] = useState<UnlockPolicy>(defaultUnlockPolicy);
  const [deviceApproval, setDeviceApproval] = useState<DeviceApprovalResponse | null>(null);
  const [deviceApprovalCode, setDeviceApprovalCode] = useState<string | null>(null);
  const [deviceApprovalLoading, setDeviceApprovalLoading] = useState(false);
  const [deviceApprovalStatus, setDeviceApprovalStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const deviceApprovalPollRef = useRef<number | null>(null);

  const stopDeviceApprovalPolling = useCallback(() => {
    if (deviceApprovalPollRef.current) {
      window.clearInterval(deviceApprovalPollRef.current);
      deviceApprovalPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getUnlockPolicy()
      .then((policy) => {
        if (!cancelled) setUnlockPolicy(policy);
      })
      .catch(() => {
        if (!cancelled) setUnlockPolicy(defaultUnlockPolicy);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => stopDeviceApprovalPolling, [stopDeviceApprovalPolling]);

  const generateVerificationCode = () => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return String(value % 1000000).padStart(6, "0");
  };

  const consumeDeviceApproval = useCallback(
    async (approval: DeviceApprovalResponse, privateKey: CryptoKey) => {
      const encryptedApproval = approval.encrypted_approval;
      if (!encryptedApproval) return false;
      let ark: Uint8Array | null = null;
      try {
        ark = await cryptoService.decryptDeviceApprovalJWE(encryptedApproval, privateKey, {
          sub,
          requestId: approval.request_id,
        });
        saveUnlockedArk(sub, ark);
        stopDeviceApprovalPolling();
        setDeviceApprovalStatus("Approved. Encryption keys unlocked for this browser.");
        setDeviceApproval(null);
        setDeviceApprovalCode(null);
        setExpanded(false);
        setSuccess("Encryption keys unlocked for this browser session.");
        const session = await api.getSession().catch(() => null);
        onUnlocked?.({ ...(session ?? { authenticated: true, sub }), keyState: "unlocked" });
        return true;
      } finally {
        if (ark) cryptoService.clearSensitiveData(ark);
      }
    },
    [onUnlocked, stopDeviceApprovalPolling, sub]
  );

  const startDeviceApprovalPolling = useCallback(
    (approval: DeviceApprovalResponse, privateKey: CryptoKey, publicJwk: JsonWebKey) => {
      stopDeviceApprovalPolling();
      let attempts = 0;
      const tick = async () => {
        attempts += 1;
        try {
          const consumed = await api.consumeDeviceApproval(approval.request_id, {
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
            setDeviceApprovalStatus(
              "Approval timed out. You can try again or enter your password."
            );
          } else {
            setDeviceApprovalStatus("Waiting for approval on another trusted browser...");
          }
        } catch {
          if (attempts > 40) {
            stopDeviceApprovalPolling();
            setDeviceApprovalStatus(
              "Approval timed out. You can try again or enter your password."
            );
          }
        }
      };
      void tick();
      deviceApprovalPollRef.current = window.setInterval(tick, 3000);
    },
    [consumeDeviceApproval, stopDeviceApprovalPolling]
  );

  const requestDeviceApproval = async () => {
    if (!isUnlockMethodAllowed(unlockPolicy, "trusted_device")) {
      setError("Trusted-browser approval is disabled by your organization policy.");
      return;
    }
    setDeviceApprovalLoading(true);
    setError(null);
    setSuccess(null);
    setDeviceApprovalStatus(null);
    try {
      const keyPair = await cryptoService.generateECDHKeyPair();
      const publicJwk = await cryptoService.exportPublicKeyJWK(keyPair.publicKey);
      const code = generateVerificationCode();
      const approval = await api.createDeviceApproval({
        newDevicePublicJwk: publicJwk,
        clientId: "user-ui",
        stateHash: await sha256Base64Url(`key-unlock:${sub}:${crypto.randomUUID()}`),
        verificationCodeHash: await sha256Base64Url(code),
      });
      const nextApproval = {
        ...approval,
        verification_code: approval.verification_code || code,
      };
      setDeviceApproval(nextApproval);
      setDeviceApprovalCode(nextApproval.verification_code || code);
      setDeviceApprovalStatus("Waiting for approval on another trusted browser...");
      setExpanded(false);
      startDeviceApprovalPolling(nextApproval, keyPair.privateKey, publicJwk);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to request device approval");
    } finally {
      setDeviceApprovalLoading(false);
    }
  };

  const unlockWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isUnlockMethodAllowed(unlockPolicy, "password")) {
      setError("Password encryption unlock is disabled by your organization policy.");
      return;
    }
    if (!email) {
      setError("Your account email is required to unlock with password.");
      return;
    }
    if (!password) {
      setError("Enter your DarkAuth password.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    let exportKey: Uint8Array | null = null;
    let sessionKey: Uint8Array | null = null;
    let ark: Uint8Array | null = null;
    let started: Awaited<ReturnType<typeof opaqueService.startLogin>> | null = null;
    try {
      started = await opaqueService.startLogin(email, password);
      const verifyStart = await api.passwordVerifyStart(started.request);
      const finish = await opaqueService.finishLogin(verifyStart.message, started.state);
      exportKey = finish.exportKey;
      sessionKey = finish.sessionKey;
      ark = await unlockArkWithExportKey(sub, exportKey);
      await api.passwordVerifyFinish(finish.request, verifyStart.sessionId);
      await saveExportKey(sub, exportKey);
      saveUnlockedArk(sub, ark);
      stopDeviceApprovalPolling();
      setDeviceApproval(null);
      setDeviceApprovalCode(null);
      setDeviceApprovalStatus(null);
      setPassword("");
      setExpanded(false);
      setSuccess("Encryption keys unlocked for this browser session.");
      const session = await api.getSession().catch(() => null);
      onUnlocked?.(session);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Password unlock failed";
      setError(
        message.toLowerCase().includes("auth") || message.toLowerCase().includes("opaque")
          ? "DarkAuth password is incorrect."
          : message
      );
    } finally {
      if (started) opaqueService.clearState(started.state);
      const arraysToClear = [exportKey, sessionKey, ark].filter(
        (value): value is Uint8Array => value instanceof Uint8Array
      );
      if (arraysToClear.length > 0) cryptoService.clearSensitiveData(...arraysToClear);
      setLoading(false);
    }
  };

  const passwordAllowed = isUnlockMethodAllowed(unlockPolicy, "password");
  const trustedDeviceAllowed = isUnlockMethodAllowed(unlockPolicy, "trusted_device");

  return (
    <div className={inline ? styles.inlinePanel : styles.panel}>
      <div className={styles.summary}>
        <div className={styles.copy}>
          <h3 className={styles.title}>Encryption keys locked</h3>
          <p className={styles.description}>
            You are signed in, but encrypted app access and key management need a local key unlock.
          </p>
        </div>
        <div className={styles.actions}>
          {trustedDeviceAllowed && !deviceApproval && (
            <Button
              type="button"
              variant="primary"
              className={styles.unlockAction}
              onClick={requestDeviceApproval}
              disabled={deviceApprovalLoading}
            >
              {deviceApprovalLoading ? "Requesting..." : "Unlock with Another Device"}
            </Button>
          )}
          {passwordAllowed && !expanded && (
            <Button
              type="button"
              variant={trustedDeviceAllowed ? "secondary" : "primary"}
              className={styles.unlockAction}
              onClick={() => setExpanded(true)}
              disabled={deviceApprovalLoading}
            >
              Unlock with Password
            </Button>
          )}
        </div>
      </div>
      {unlockPolicy.managed && (
        <div className={styles.status}>
          Your organization manages which encryption unlock methods are available.
        </div>
      )}
      {!passwordAllowed && !trustedDeviceAllowed && (
        <div className={styles.error}>No browser unlock method is enabled for this account.</div>
      )}
      {deviceApproval && (
        <div className={styles.approval}>
          <h4>Approve from a trusted browser</h4>
          <p>
            Open Security Settings on a browser you already trusted, approve this request, and
            confirm the verification code matches.
          </p>
          <div className={styles.code}>{deviceApprovalCode}</div>
          {deviceApprovalStatus && <div className={styles.status}>{deviceApprovalStatus}</div>}
          {passwordAllowed && (
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  stopDeviceApprovalPolling();
                  setDeviceApproval(null);
                  setDeviceApprovalCode(null);
                  setDeviceApprovalStatus(null);
                  setExpanded(true);
                }}
              >
                Use password instead
              </Button>
            </div>
          )}
        </div>
      )}
      {passwordAllowed && expanded && (
        <form className={styles.form} onSubmit={unlockWithPassword}>
          <div className={styles.field}>
            <label htmlFor={passwordId}>DarkAuth password</label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter your DarkAuth password"
              disabled={loading}
            />
          </div>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Unlocking..." : "Unlock with Password"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setExpanded(false);
                setPassword("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
    </div>
  );
}
