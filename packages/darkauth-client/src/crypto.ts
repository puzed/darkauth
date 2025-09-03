export function bytesToBase64Url(bytes: Uint8Array): string {
  let binaryString = "";
  for (const byte of bytes) binaryString += String.fromCharCode(byte);
  return btoa(binaryString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 2 ? "==" : base64.length % 4 === 3 ? "=" : "";
  return Uint8Array.from(atob(base64 + padding), (c) => c.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (const byte of bytes) binaryString += String.fromCharCode(byte);
  return btoa(binaryString);
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

export async function hkdf(
  key: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length = 32
): Promise<Uint8Array> {
  const toAB = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const importedKey = await crypto.subtle.importKey("raw", toAB(key), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toAB(salt), info: toAB(info) },
    importedKey,
    length * 8
  );
  return new Uint8Array(bits);
}

export async function aeadEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  additionalData: Uint8Array
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const toAB = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: toAB(additionalData) },
    key,
    toAB(plaintext)
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function aeadDecrypt(
  key: CryptoKey,
  payload: Uint8Array,
  additionalData: Uint8Array
): Promise<Uint8Array> {
  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12);
  const toAB = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: toAB(additionalData) },
    key,
    toAB(ciphertext)
  );
  return new Uint8Array(plaintext);
}

export async function aeadKey(bytes: Uint8Array): Promise<CryptoKey> {
  const toAB = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("raw", toAB(bytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function deriveDek(drk: Uint8Array, noteId: string): Promise<Uint8Array> {
  const salt = new TextEncoder().encode("DarkAuth|demo-notes");
  const info = new TextEncoder().encode(`note:${noteId}`);
  return hkdf(drk, salt, info, 32);
}

export async function encryptNote(
  drk: Uint8Array,
  noteId: string,
  content: string
): Promise<string> {
  const dek = await deriveDek(drk, noteId);
  return encryptNoteWithDek(dek, noteId, content);
}

export async function decryptNote(
  drk: Uint8Array,
  noteId: string,
  ciphertextBase64: string,
  aadObject: Record<string, unknown>
): Promise<string> {
  const dek = await deriveDek(drk, noteId);
  return decryptNoteWithDek(dek, noteId, ciphertextBase64, aadObject);
}

export async function encryptNoteWithDek(
  dek: Uint8Array,
  noteId: string,
  content: string
): Promise<string> {
  const key = await aeadKey(dek);
  const plaintext = new TextEncoder().encode(content);
  const aad = new TextEncoder().encode(JSON.stringify({ note_id: noteId }));
  const { iv, ciphertext } = await aeadEncrypt(key, plaintext, aad);
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv, 0);
  payload.set(ciphertext, iv.length);
  return bytesToBase64(payload);
}

export async function decryptNoteWithDek(
  dek: Uint8Array,
  noteId: string,
  ciphertextBase64: string,
  aadObject: Record<string, unknown>
): Promise<string> {
  if (noteId === "") {
    // touch param to satisfy TS noUnusedParameters
  }
  const key = await aeadKey(dek);
  const aad = new TextEncoder().encode(JSON.stringify(aadObject));
  const payload = base64ToBytes(ciphertextBase64);
  const plaintext = await aeadDecrypt(key, payload, aad);
  return new TextDecoder().decode(plaintext);
}

export async function wrapPrivateKey(privateKeyJwk: JsonWebKey, drk: Uint8Array): Promise<string> {
  const salt = new TextEncoder().encode("DarkAuth|user-keys");
  const info = new TextEncoder().encode("private-key-wrap");
  const wrapKey = await hkdf(drk, salt, info, 32);
  const key = await aeadKey(wrapKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
  const aad = new TextEncoder().encode("user-private-key");
  const { iv, ciphertext } = await aeadEncrypt(key, plaintext, aad);
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv, 0);
  payload.set(ciphertext, iv.length);
  return bytesToBase64Url(payload);
}

export async function unwrapPrivateKey(wrappedKey: string, drk: Uint8Array): Promise<JsonWebKey> {
  const salt = new TextEncoder().encode("DarkAuth|user-keys");
  const info = new TextEncoder().encode("private-key-wrap");
  const wrapKey = await hkdf(drk, salt, info, 32);
  const key = await aeadKey(wrapKey);
  const payload = base64UrlToBytes(wrappedKey);
  const aad = new TextEncoder().encode("user-private-key");
  const plaintext = await aeadDecrypt(key, payload, aad);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
