import { fromBase64Url, toBase64Url } from "./crypto";

const STORAGE_PREFIX = "DarkAuth_drk:";
const STORAGE_VERSION = 1;
const OBFUSCATION_KEY = "DarkAuth-Storage-Protection-2025";

type StoredDrkEntry = {
  obfuscated: string;
  wrappedDrkHash: string;
  version: number;
};

function obfuscate(drk: Uint8Array): Uint8Array {
  const obfKey = new TextEncoder().encode(OBFUSCATION_KEY);
  const out = new Uint8Array(drk.length);
  for (let i = 0; i < drk.length; i++) {
    const a = drk[i] ?? 0;
    const b = obfKey[i % obfKey.length] ?? 0;
    out[i] = a ^ b;
  }
  return out;
}

function deobfuscate(obfuscated: Uint8Array): Uint8Array {
  return obfuscate(obfuscated);
}

export function saveDrk(sub: string, drk: Uint8Array, wrappedDrkHash: string): void {
  const entry: StoredDrkEntry = {
    obfuscated: toBase64Url(obfuscate(drk)),
    wrappedDrkHash,
    version: STORAGE_VERSION,
  };
  localStorage.setItem(`${STORAGE_PREFIX}${sub}`, JSON.stringify(entry));
}

export function loadDrk(sub: string): { drk: Uint8Array; wrappedDrkHash: string } | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${sub}`);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as StoredDrkEntry;
    if (entry.version !== STORAGE_VERSION) {
      clearDrk(sub);
      return null;
    }
    if (!entry.obfuscated || !entry.wrappedDrkHash) {
      clearDrk(sub);
      return null;
    }
    const obfuscated = fromBase64Url(entry.obfuscated);
    return { drk: deobfuscate(obfuscated), wrappedDrkHash: entry.wrappedDrkHash };
  } catch {
    clearDrk(sub);
    return null;
  }
}

export function clearDrk(sub: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${sub}`);
}

export function clearAllDrk(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => {
    localStorage.removeItem(key);
  });
}
