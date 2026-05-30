import { useId, useState } from "react";
import api, { type KeyEnvelopeResponse, type SessionResponse } from "../services/api";
import cryptoService, { fromBase64Url } from "../services/crypto";
import deviceKeyStore from "../services/deviceKeyStore";
import opaqueService from "../services/opaque";
import { loadExportKey, saveExportKey } from "../services/sessionKey";
import { loadUnlockedArk, saveUnlockedArk } from "../services/unlockedArk";
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const unlockWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
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

  return (
    <div className={inline ? styles.inlinePanel : styles.panel}>
      <div className={styles.summary}>
        <div className={styles.copy}>
          <h3 className={styles.title}>Encryption keys locked</h3>
          <p className={styles.description}>
            You are signed in, but encrypted app access and key management need a local key unlock.
          </p>
        </div>
        {!expanded && (
          <Button type="button" variant="primary" onClick={() => setExpanded(true)}>
            Unlock with Password
          </Button>
        )}
      </div>
      {expanded && (
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
