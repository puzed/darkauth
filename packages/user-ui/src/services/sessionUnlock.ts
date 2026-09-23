import apiService from "./api";
import { fromBase64Url, toBase64Url } from "./crypto";
import { logger } from "./logger";

const STORAGE_PREFIX = "DarkAuth_session_ark:";
const VERSION = 1;
const encoder = new TextEncoder();

interface SessionArkEnvelope {
  v: number;
  sub: string;
  key_id: string;
  iv: string;
  ct: string;
}

function storageKey(sub: string): string {
  return `${STORAGE_PREFIX}${sub}`;
}

function envelopeAad(sub: string, keyId: string): BufferSource {
  return encoder.encode(`DarkAuth|session-ark|v${VERSION}|sub=${sub}|key_id=${keyId}`);
}

function readEnvelope(sub: string): SessionArkEnvelope | null {
  try {
    const raw = localStorage.getItem(storageKey(sub));
    return raw ? (JSON.parse(raw) as SessionArkEnvelope) : null;
  } catch {
    return null;
  }
}

export function clearSessionArk(sub: string): void {
  try {
    localStorage.removeItem(storageKey(sub));
  } catch (error) {
    logger.warn(error, "Failed to clear session unlock envelope");
  }
}

export function clearAllSessionArks(exceptSub?: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX) && (!exceptSub || key !== storageKey(exceptSub))) {
        keys.push(key);
      }
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch (error) {
    logger.warn(error, "Failed to clear session unlock envelopes");
  }
}

export async function resolveAccountKeyId(sub: string): Promise<string> {
  const keybag = await apiService.getKeybag();
  const activeKey = keybag.account_keys.find((key) => key.status === "active");
  return activeKey ? activeKey.key_id : `legacy-drk:${sub}`;
}

async function fetchSessionKey(): Promise<{ key: CryptoKey | null; allowed: boolean }> {
  const policy = await apiService.getUnlockPolicy();
  if (!policy.allowSessionUnlock) return { key: null, allowed: false };
  const raw = fromBase64Url(await apiService.getSessionUnlockKey());
  try {
    if (raw.length !== 32) return { key: null, allowed: true };
    const key = await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    return { key, allowed: true };
  } finally {
    raw.fill(0);
  }
}

export async function storeSessionArk(sub: string, ark: Uint8Array): Promise<void> {
  const plaintext = new Uint8Array(ark);
  try {
    clearAllSessionArks(sub);
    const { key } = await fetchSessionKey();
    if (!key) {
      clearSessionArk(sub);
      return;
    }
    const keyId = await resolveAccountKeyId(sub);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: envelopeAad(sub, keyId) },
      key,
      plaintext as BufferSource
    );
    const envelope: SessionArkEnvelope = {
      v: VERSION,
      sub,
      key_id: keyId,
      iv: toBase64Url(iv),
      ct: toBase64Url(ciphertext),
    };
    localStorage.setItem(storageKey(sub), JSON.stringify(envelope));
  } catch (error) {
    logger.warn(
      error,
      "Session unlock envelope not stored; this browser will ask to unlock in new tabs"
    );
    clearSessionArk(sub);
  } finally {
    plaintext.fill(0);
  }
}

async function openEnvelope(
  sub: string,
  envelope: SessionArkEnvelope,
  key: CryptoKey
): Promise<Uint8Array | null> {
  if (
    envelope.v !== VERSION ||
    envelope.sub !== sub ||
    typeof envelope.key_id !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ct !== "string"
  ) {
    return null;
  }
  const ark = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(envelope.iv) as BufferSource,
        additionalData: envelopeAad(sub, envelope.key_id),
      },
      key,
      fromBase64Url(envelope.ct) as BufferSource
    )
  );
  if (ark.length === 32) return ark;
  ark.fill(0);
  return null;
}

export async function restoreSessionArk(sub: string): Promise<Uint8Array | null> {
  const envelope = readEnvelope(sub);
  if (!envelope) return null;
  let key: CryptoKey | null = null;
  let keyId: string;
  try {
    const [session, activeKeyId] = await Promise.all([fetchSessionKey(), resolveAccountKeyId(sub)]);
    if (!session.allowed) {
      clearSessionArk(sub);
      return null;
    }
    key = session.key;
    keyId = activeKeyId;
  } catch (error) {
    logger.warn(error, "Session unlock envelope could not be opened yet");
    return null;
  }
  if (!key) return null;
  if (keyId !== envelope.key_id) {
    clearSessionArk(sub);
    return null;
  }
  const ark = await openEnvelope(sub, envelope, key).catch(() => null);
  if (!ark) clearSessionArk(sub);
  return ark;
}
