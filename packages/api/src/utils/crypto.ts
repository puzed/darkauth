import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function sha256Base64Url(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("base64url");
}

export function generateRandomBytes(length: number): Buffer {
  return randomBytes(length);
}

export function generateRandomString(length: number): string {
  return randomBytes(length).toString("base64url");
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare bufA against itself to maintain constant time even on length mismatch
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function encryptAesGcm(
  plaintext: Buffer,
  key: Buffer,
  aad?: Buffer
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad && aad.length > 0) cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const tag = cipher.getAuthTag();

  return { ciphertext, iv, tag };
}

export function decryptAesGcm(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
  aad?: Buffer
): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad && aad.length > 0) decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function fromBase64(str: string): Buffer {
  return Buffer.from(str, "base64");
}

/**
 * HKDF (RFC 5869) implementation using SHA-256
 */
export function hkdf(
  ikm: Buffer,
  salt: Buffer | string,
  info: Buffer | string,
  length: number
): Buffer {
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, "utf8");
  const infoBuffer = Buffer.isBuffer(info) ? info : Buffer.from(info, "utf8");

  // Extract phase
  const prk = createHmac("sha256", saltBuffer).update(ikm).digest();

  // Expand phase
  const n = Math.ceil(length / 32); // SHA-256 output is 32 bytes
  let okm = Buffer.alloc(0) as unknown as Buffer;
  let t = Buffer.alloc(0) as unknown as Buffer;

  for (let i = 1; i <= n; i++) {
    const hmac = createHmac("sha256", prk);
    hmac.update(t);
    hmac.update(infoBuffer);
    hmac.update(Buffer.from([i]));
    t = hmac.digest() as unknown as Buffer;
    okm = Buffer.concat([okm, t]);
  }

  return okm.subarray(0, length);
}

/**
 * DarkAuth Key Schedule (v1)
 * MK  = HKDF-SHA256(export_key, salt=H("DarkAuth|v1|tenant=" + TENANT + "|user=" + sub), info="mk")
 * KW  = HKDF-SHA256(MK, salt="DarkAuth|v1", info="wrap-key")
 * KDerive = HKDF-SHA256(MK, salt="DarkAuth|v1", info="data-derive")
 */
export function deriveKeysFromExportKey(
  exportKey: Buffer,
  sub: string,
  tenant = "default"
): {
  masterKey: Buffer;
  wrapKey: Buffer;
  deriveKey: Buffer;
} {
  // Create salt for master key derivation
  const saltString = `DarkAuth|v1|tenant=${tenant}|user=${sub}`;
  const salt = sha256(saltString);

  // Derive master key (MK)
  const masterKey = hkdf(exportKey, salt, "mk", 32);

  // Derive wrap key (KW) for DRK encryption
  const wrapKey = hkdf(masterKey, "DarkAuth|v1", "wrap-key", 32);

  // Derive data key (KDerive) for per-record keys if needed
  const deriveKey = hkdf(masterKey, "DarkAuth|v1", "data-derive", 32);

  return { masterKey, wrapKey, deriveKey };
}

/**
 * Wrap DRK using AEAD (AES-256-GCM) with KW and AAD=sub
 */
export function wrapDrk(drk: Buffer, wrapKey: Buffer, sub: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
  cipher.setAAD(Buffer.from(sub, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(drk), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv(12) + tag(16) + ciphertext(32)
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Unwrap DRK using AEAD (AES-256-GCM) with KW and AAD=sub
 */
export function unwrapDrk(wrappedDrk: Buffer, wrapKey: Buffer, sub: string): Buffer {
  if (wrappedDrk.length < 28) {
    // 12 + 16 minimum
    throw new Error("Invalid wrapped DRK format");
  }

  const iv = wrappedDrk.subarray(0, 12);
  const tag = wrappedDrk.subarray(12, 28);
  const ciphertext = wrappedDrk.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", wrapKey, iv);
  decipher.setAAD(Buffer.from(sub, "utf8"));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
