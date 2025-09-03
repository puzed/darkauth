import { fromBase64Url, toBase64Url } from "./crypto";

const prefix = "DarkAuth_export_key:";

export function saveExportKey(sub: string, key: Uint8Array): void {
  const k = toBase64Url(key);
  sessionStorage.setItem(prefix + sub, k);
}

export function loadExportKey(sub: string): Uint8Array | null {
  const v = sessionStorage.getItem(prefix + sub);
  if (!v) return null;
  return fromBase64Url(v);
}

export function clearExportKey(sub: string): void {
  sessionStorage.removeItem(prefix + sub);
}
