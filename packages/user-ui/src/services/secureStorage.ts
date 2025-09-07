// Secure storage service for export keys with enhanced XSS protection
// Uses WebCrypto PBKDF2, integrity checks, and key rotation

import { fromBase64Url, toBase64Url } from "./crypto";

interface SecureStorageEntry {
  encryptedData: string;
  salt: string;
  iv: string;
  hmac: string;
  timestamp: number;
  version: number;
}

interface StorageMetadata {
  sessionId: string;
  keyRotationCount: number;
  lastAccess: number;
  suspiciousActivity: boolean;
}

// Storage keys and metadata
const STORAGE_PREFIX = "DarkAuth_secure:";
const METADATA_KEY = "DarkAuth_meta";
const MAX_KEY_AGE_MS = 30 * 60 * 1000; // 30 minutes
const PBKDF2_ITERATIONS = 100000; // Strong but reasonable for browser
const STORAGE_VERSION = 1;

class SecureStorageService {
  private sessionId: string;
  private storageKey: CryptoKey | null = null;
  private integrityKey: CryptoKey | null = null;
  private keyRotationCount = 0;

  constructor() {
    // Generate unique session ID
    this.sessionId = this.generateSessionId();
    this.initializeSession();
  }

  private generateSessionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return toBase64Url(array);
  }

  private async initializeSession(): Promise<void> {
    // Check if we need to rotate keys due to suspicious activity
    const metadata = this.getMetadata();
    if (metadata?.suspiciousActivity) {
      await this.rotateKeys();
    }

    // Initialize or load key rotation count
    if (metadata) {
      this.keyRotationCount = metadata.keyRotationCount;
    }

    this.updateMetadata();
  }

  private getMetadata(): StorageMetadata | null {
    try {
      const metaStr = sessionStorage.getItem(METADATA_KEY);
      if (!metaStr) return null;
      return JSON.parse(metaStr);
    } catch {
      return null;
    }
  }

  private updateMetadata(): void {
    const metadata: StorageMetadata = {
      sessionId: this.sessionId,
      keyRotationCount: this.keyRotationCount,
      lastAccess: Date.now(),
      suspiciousActivity: false,
    };
    sessionStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  }

  private async deriveStorageKeys(
    password: string,
    salt: Uint8Array
  ): Promise<{ storageKey: CryptoKey; integrityKey: CryptoKey }> {
    const passwordBuffer = new TextEncoder().encode(password);

    // Import password for PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    // Derive 64 bytes (32 for encryption, 32 for HMAC)
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      512 // 64 bytes
    );

    const derivedArray = new Uint8Array(derivedBits);
    const encryptionKeyMaterial = derivedArray.slice(0, 32);
    const hmacKeyMaterial = derivedArray.slice(32, 64);

    // Clear the password buffer
    passwordBuffer.fill(0);

    // Create encryption key
    const storageKey = await crypto.subtle.importKey(
      "raw",
      encryptionKeyMaterial,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );

    // Create HMAC key for integrity
    const integrityKey = await crypto.subtle.importKey(
      "raw",
      hmacKeyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    // Clear key material
    encryptionKeyMaterial.fill(0);
    hmacKeyMaterial.fill(0);

    return { storageKey, integrityKey };
  }

  private async getOrCreateKeys(): Promise<{ storageKey: CryptoKey; integrityKey: CryptoKey }> {
    if (this.storageKey && this.integrityKey) {
      return { storageKey: this.storageKey, integrityKey: this.integrityKey };
    }

    // Generate per-session derivation password from multiple entropy sources
    const entropySourcesArray = [
      this.sessionId,
      String(this.keyRotationCount),
      navigator.userAgent.slice(-20), // Last 20 chars for some fingerprinting
      String(performance.now()),
      String(Date.now()),
    ];

    const derivationPassword = entropySourcesArray.join("|");
    const salt = crypto.getRandomValues(new Uint8Array(32));

    const keys = await this.deriveStorageKeys(derivationPassword, salt);
    this.storageKey = keys.storageKey;
    this.integrityKey = keys.integrityKey;

    return keys;
  }

  private async encryptData(
    data: Uint8Array,
    storageKey: CryptoKey,
    integrityKey: CryptoKey
  ): Promise<SecureStorageEntry> {
    // Generate salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      storageKey,
      data as BufferSource
    );

    const encryptedData = toBase64Url(encryptedBuffer);
    const saltB64 = toBase64Url(salt);
    const ivB64 = toBase64Url(iv);

    // Create HMAC for integrity check
    const payload = `${encryptedData}|${saltB64}|${ivB64}|${Date.now()}|${STORAGE_VERSION}`;
    const hmacBuffer = await crypto.subtle.sign(
      "HMAC",
      integrityKey,
      new TextEncoder().encode(payload)
    );
    const hmac = toBase64Url(hmacBuffer);

    return {
      encryptedData,
      salt: saltB64,
      iv: ivB64,
      hmac,
      timestamp: Date.now(),
      version: STORAGE_VERSION,
    };
  }

  private async decryptData(
    entry: SecureStorageEntry,
    storageKey: CryptoKey,
    integrityKey: CryptoKey
  ): Promise<Uint8Array> {
    // Verify integrity first
    const payload = `${entry.encryptedData}|${entry.salt}|${entry.iv}|${entry.timestamp}|${entry.version}`;
    const hmacBuffer = await crypto.subtle.sign(
      "HMAC",
      integrityKey,
      new TextEncoder().encode(payload)
    );
    const expectedHmac = toBase64Url(hmacBuffer);

    if (expectedHmac !== entry.hmac) {
      // Potential tampering detected
      await this.markSuspiciousActivity();
      throw new Error("Storage integrity check failed");
    }

    // Check age
    const age = Date.now() - entry.timestamp;
    if (age > MAX_KEY_AGE_MS) {
      throw new Error("Stored key has expired");
    }

    // Check version
    if (entry.version !== STORAGE_VERSION) {
      throw new Error("Unsupported storage version");
    }

    // Decrypt
    const encryptedBuffer = fromBase64Url(entry.encryptedData);
    const iv = fromBase64Url(entry.iv);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      storageKey,
      encryptedBuffer as BufferSource
    );

    return new Uint8Array(decryptedBuffer);
  }

  private async markSuspiciousActivity(): Promise<void> {
    const metadata = this.getMetadata();
    if (metadata) {
      metadata.suspiciousActivity = true;
      sessionStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
    }
    await this.rotateKeys();
  }

  private async rotateKeys(): Promise<void> {
    this.keyRotationCount++;
    this.storageKey = null;
    this.integrityKey = null;
    this.updateMetadata();
  }

  async saveExportKey(sub: string, key: Uint8Array): Promise<void> {
    const keys = await this.getOrCreateKeys();
    const entry = await this.encryptData(key, keys.storageKey, keys.integrityKey);
    const storageKey = STORAGE_PREFIX + sub;
    sessionStorage.setItem(storageKey, JSON.stringify(entry));
    this.updateMetadata();
  }

  async loadExportKey(sub: string): Promise<Uint8Array | null> {
    try {
      const storageKey = STORAGE_PREFIX + sub;
      const entryStr = sessionStorage.getItem(storageKey);
      if (!entryStr) return null;

      const entry: SecureStorageEntry = JSON.parse(entryStr);
      const keys = await this.getOrCreateKeys();
      const decryptedKey = await this.decryptData(entry, keys.storageKey, keys.integrityKey);

      this.updateMetadata();
      return decryptedKey;
    } catch (error) {
      console.warn("Failed to load export key:", error);
      // Clear potentially corrupted data
      this.clearExportKey(sub);
      return null;
    }
  }

  clearExportKey(sub: string): void {
    const storageKey = STORAGE_PREFIX + sub;
    sessionStorage.removeItem(storageKey);
    this.updateMetadata();
  }

  // Clear all export keys (useful for logout)
  clearAllExportKeys(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      sessionStorage.removeItem(key);
    });
    sessionStorage.removeItem(METADATA_KEY);
    this.storageKey = null;
    this.integrityKey = null;
  }

  // Get current security status
  getSecurityStatus(): {
    sessionId: string;
    keyRotationCount: number;
    hasKeys: boolean;
    lastAccess: number | null;
    suspiciousActivity: boolean;
  } {
    const metadata = this.getMetadata();
    return {
      sessionId: this.sessionId,
      keyRotationCount: this.keyRotationCount,
      hasKeys: this.storageKey !== null && this.integrityKey !== null,
      lastAccess: metadata?.lastAccess || null,
      suspiciousActivity: metadata?.suspiciousActivity || false,
    };
  }
}

// Export singleton instance
export const secureStorageService = new SecureStorageService();
export default secureStorageService;
