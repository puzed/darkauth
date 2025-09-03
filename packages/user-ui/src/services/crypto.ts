// Crypto service for DRK (Derived Root Key) and JWE handling

export interface ECDHKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface JWEHeader {
  alg: string;
  enc: string;
  kid?: string;
}

export interface JWEData {
  header: JWEHeader;
  encryptedKey: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface ZKDeliveryData {
  drkHash: string;
  jwe: string;
}

// Base64url encoding/decoding utilities
export function toBase64Url(buffer: ArrayBuffer | Uint8Array | number[]): string {
  let bytes: Uint8Array;
  if (buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buffer);
  } else if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else if (Array.isArray(buffer)) {
    bytes = Uint8Array.from(buffer as number[]);
  } else {
    const err = "Unsupported buffer type for toBase64Url";
    throw new Error(err);
  }
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Generate a secure random string
export function generateRandomString(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return toBase64Url(array);
}

// SHA-256 hash with base64url encoding
export async function sha256Base64Url(
  data: Uint8Array | ArrayBuffer | number[] | string
): Promise<string> {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (Array.isArray(data)) {
    bytes = new Uint8Array(data);
  } else if (typeof data === "string") {
    const encoder = new TextEncoder();
    bytes = encoder.encode(data);
  } else {
    throw new Error("Unsupported data type for sha256Base64Url");
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toBase64Url(hashBuffer);
}

class CryptoService {
  // Generate ECDH key pair for ZK delivery
  async generateECDHKeyPair(): Promise<ECDHKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true, // extractable
      ["deriveKey", "deriveBits"]
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  }

  // Export public key to JWK format
  async exportPublicKeyJWK(publicKey: CryptoKey): Promise<JsonWebKey> {
    return await crypto.subtle.exportKey("jwk", publicKey);
  }

  // Import public key from JWK format
  async importPublicKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      false,
      []
    );
  }

  // Generate DRK (Derived Root Key) - 32 random bytes, generated once on first login
  async generateDRK(): Promise<Uint8Array> {
    const drk = new Uint8Array(32);
    crypto.getRandomValues(drk);
    return drk;
  }

  // HKDF implementation as per CORE.md spec
  async hkdf(
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number
  ): Promise<Uint8Array> {
    // Extract phase
    const saltKey = await crypto.subtle.importKey(
      "raw",
      salt as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const prk = await crypto.subtle.sign("HMAC", saltKey, ikm as BufferSource);

    // Expand phase
    const n = Math.ceil(length / 32); // SHA-256 output is 32 bytes
    let t = new Uint8Array(0);
    let okm = new Uint8Array(0);

    const prkKey = await crypto.subtle.importKey(
      "raw",
      prk,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    for (let i = 1; i <= n; i++) {
      const input = new Uint8Array(t.length + info.length + 1);
      input.set(t, 0);
      input.set(info, t.length);
      input.set([i], t.length + info.length);

      t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, input as BufferSource));
      const newOkm = new Uint8Array(okm.length + t.length);
      newOkm.set(okm, 0);
      newOkm.set(t, okm.length);
      okm = newOkm;
    }

    return okm.slice(0, length);
  }

  // DarkAuth Key Schedule (v1) as specified in CORE.md
  async deriveKeysFromExportKey(
    exportKey: Uint8Array,
    sub: string,
    tenant = "default"
  ): Promise<{
    masterKey: Uint8Array;
    wrapKey: Uint8Array;
    deriveKey: Uint8Array;
  }> {
    // Create salt for master key derivation
    const saltString = `DarkAuth|v1|tenant=${tenant}|user=${sub}`;
    const saltBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(saltString));
    const salt = new Uint8Array(saltBuffer);

    // Derive master key (MK)
    const masterKey = await this.hkdf(exportKey, salt, new TextEncoder().encode("mk"), 32);

    // Derive wrap key (KW) for DRK encryption
    const wrapKey = await this.hkdf(
      masterKey,
      new TextEncoder().encode("DarkAuth|v1"),
      new TextEncoder().encode("wrap-key"),
      32
    );

    // Derive data key (KDerive) for per-record keys if needed
    const deriveKey = await this.hkdf(
      masterKey,
      new TextEncoder().encode("DarkAuth|v1"),
      new TextEncoder().encode("data-derive"),
      32
    );

    return { masterKey, wrapKey, deriveKey };
  }

  // Wrap DRK using AEAD (AES-256-GCM) with KW and AAD=sub as specified in CORE.md
  async wrapDRK(drk: Uint8Array, wrapKey: Uint8Array, sub: string): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey("raw", wrapKey as BufferSource, "AES-GCM", false, [
      "encrypt",
    ]);

    const aad = new TextEncoder().encode(sub);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: aad as BufferSource,
      },
      key,
      drk as BufferSource
    );

    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = encryptedArray.slice(0, -16);
    const tag = encryptedArray.slice(-16);

    // Format: iv(12) + tag(16) + ciphertext(32)
    const wrapped = new Uint8Array(12 + 16 + ciphertext.length);
    wrapped.set(iv, 0);
    wrapped.set(tag, 12);
    wrapped.set(ciphertext, 28);

    return wrapped;
  }

  // Unwrap DRK using AEAD (AES-256-GCM) with KW and AAD=sub
  async unwrapDRK(wrappedDrk: Uint8Array, wrapKey: Uint8Array, sub: string): Promise<Uint8Array> {
    if (wrappedDrk.length < 28) {
      // 12 + 16 minimum
      throw new Error("Invalid wrapped DRK format");
    }

    const iv = wrappedDrk.slice(0, 12);
    const tag = wrappedDrk.slice(12, 28);
    const ciphertext = wrappedDrk.slice(28);

    const key = await crypto.subtle.importKey("raw", wrapKey as BufferSource, "AES-GCM", false, [
      "decrypt",
    ]);

    // Reconstruct encrypted data with tag appended
    const encryptedData = new Uint8Array(ciphertext.length + tag.length);
    encryptedData.set(ciphertext, 0);
    encryptedData.set(tag, ciphertext.length);

    const aad = new TextEncoder().encode(sub);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: aad as BufferSource,
      },
      key,
      encryptedData as BufferSource
    );

    return new Uint8Array(decrypted);
  }

  // Create DRK JWE using ECDH-ES + A256GCM via JOSE
  async createDrkJWE(
    drk: Uint8Array,
    recipientPublicJwk: JsonWebKey,
    sub: string,
    clientId: string
  ): Promise<string> {
    const { CompactEncrypt, importJWK } = await import("jose");
    const pub: JsonWebKey = { ...recipientPublicJwk, alg: undefined };
    const key = await importJWK(pub, "ECDH-ES");
    const header: import("jose").CompactJWEHeaderParameters & { sub: string; client_id: string } = {
      alg: "ECDH-ES",
      enc: "A256GCM",
      sub,
      client_id: clientId,
    };
    const jwe = await new CompactEncrypt(drk).setProtectedHeader(header).encrypt(key);
    return jwe;
  }

  parseJWEFromFragment(): string | null {
    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    return params.get("drk_jwe");
  }

  // Decrypt JWE using ECDH-ES + A256GCM
  async decryptJWE(
    jwe: string,
    clientPrivateKey: CryptoKey,
    serverPublicKey: CryptoKey
  ): Promise<unknown> {
    const parts = jwe.split(".");
    if (parts.length !== 5) {
      throw new Error("Invalid JWE format");
    }

    const [encodedHeader, , encodedIv, encodedCiphertext, encodedTag] = parts;

    // Parse header
    const headerBytes = fromBase64Url(encodedHeader);
    const header: JWEHeader = JSON.parse(new TextDecoder().decode(headerBytes));

    if (header.alg !== "ECDH-ES" || header.enc !== "A256GCM") {
      throw new Error("Unsupported JWE algorithm");
    }

    // Derive shared key
    const sharedKey = await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: serverPublicKey,
      },
      clientPrivateKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["decrypt"]
    );

    // Decrypt
    const iv = fromBase64Url(encodedIv);
    const ciphertext = fromBase64Url(encodedCiphertext);
    const tag = fromBase64Url(encodedTag);

    const encryptedData = new Uint8Array(ciphertext.length + tag.length);
    encryptedData.set(ciphertext, 0);
    encryptedData.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: new TextEncoder().encode(encodedHeader),
      },
      sharedKey,
      encryptedData as BufferSource
    );

    const payloadText = new TextDecoder().decode(decrypted);
    return JSON.parse(payloadText);
  }

  // Hash DRK for verification
  async hashDRK(drk: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", drk as BufferSource);
    return toBase64Url(hashBuffer);
  }

  // Secure clear of sensitive data
  clearSensitiveData(...arrays: Uint8Array[]): void {
    for (const array of arrays) {
      array.fill(0);
    }
  }

  async wrapEncPrivateJwkWithDrk(privateJwk: JsonWebKey, drk: Uint8Array): Promise<string> {
    const salt = new TextEncoder().encode("DarkAuth|user-keys");
    const info = new TextEncoder().encode("private-key-wrap");
    const wrapKey = await this.hkdf(drk, salt, info, 32);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey("raw", wrapKey as BufferSource, "AES-GCM", false, [
      "encrypt",
    ]);
    const aad = new TextEncoder().encode("user-private-key");
    const pt = new TextEncoder().encode(JSON.stringify(privateJwk));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, pt)
    );
    const payload = new Uint8Array(iv.length + ct.length);
    payload.set(iv, 0);
    payload.set(ct, iv.length);
    return toBase64Url(payload);
  }
}

// The four required app data crypto functions as specified in CORE.md
export async function encrypt(data: unknown, drk: CryptoKey | ArrayBuffer): Promise<string> {
  const key = await asAesGcmKey(drk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return toBase64Url(concat(iv, new Uint8Array(ct)));
}

export async function decrypt(b64: string, drk: CryptoKey | ArrayBuffer): Promise<unknown> {
  const buf = fromBase64Url(b64);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const key = await asAesGcmKey(drk);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

export const encrypt_old = encrypt; // same, using DRK recovered via old password during change
export const decrypt_old = decrypt;

async function asAesGcmKey(k: CryptoKey | ArrayBuffer): Promise<CryptoKey> {
  return k instanceof CryptoKey
    ? k
    : crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export const cryptoService = new CryptoService();
export default cryptoService;
