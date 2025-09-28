import { fromBase64Url, toBase64Url } from "./crypto";
import { logger } from "./logger";

type SecureStorageEntry = {
  ciphertext: string;
  iv: string;
  timestamp: number;
  version: number;
};

type StorageMetadata = {
  sessionId: string;
  encryptionKey: string;
  lastAccess: number;
};

const STORAGE_PREFIX = "DarkAuth_secure:";
const METADATA_KEY = "DarkAuth_meta";
const STORAGE_VERSION = 1;

function toBuffer(view: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = view;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  const copy = view.slice();
  return copy.buffer;
}

class SecureStorageService {
  private encryptionKey: CryptoKey | null = null;
  private metadata: StorageMetadata | null = null;

  private loadMetadata(): StorageMetadata | null {
    try {
      const raw = sessionStorage.getItem(METADATA_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StorageMetadata;
    } catch {
      return null;
    }
  }

  private async persistMetadata(metadata: StorageMetadata): Promise<void> {
    this.metadata = metadata;
    sessionStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  }

  private async ensureEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const existingMetadata = this.loadMetadata();
    if (existingMetadata?.encryptionKey) {
      try {
        const raw = fromBase64Url(existingMetadata.encryptionKey);
        const key = await crypto.subtle.importKey(
          "raw",
          toBuffer(raw),
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"]
        );
        this.encryptionKey = key;
        this.metadata = existingMetadata;
        return key;
      } catch (error) {
        logger.warn(error, "Failed to import stored secure storage key");
      }
    }

    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey("raw", toBuffer(rawKey), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    const sessionId = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    await this.persistMetadata({
      sessionId,
      encryptionKey: toBase64Url(rawKey),
      lastAccess: Date.now(),
    });
    rawKey.fill(0);
    this.encryptionKey = key;
    return key;
  }

  private updateLastAccess(): void {
    if (!this.metadata) return;
    this.metadata.lastAccess = Date.now();
    sessionStorage.setItem(METADATA_KEY, JSON.stringify(this.metadata));
  }

  async saveExportKey(sub: string, key: Uint8Array): Promise<void> {
    const storageKey = await this.ensureEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBuffer(iv) },
      storageKey,
      toBuffer(key)
    );
    const entry: SecureStorageEntry = {
      ciphertext: toBase64Url(ciphertext),
      iv: toBase64Url(iv),
      timestamp: Date.now(),
      version: STORAGE_VERSION,
    };
    sessionStorage.setItem(`${STORAGE_PREFIX}${sub}`, JSON.stringify(entry));
    this.updateLastAccess();
  }

  async loadExportKey(sub: string): Promise<Uint8Array | null> {
    try {
      const entryStr = sessionStorage.getItem(`${STORAGE_PREFIX}${sub}`);
      if (!entryStr) return null;
      const entry = JSON.parse(entryStr) as SecureStorageEntry;
      if (entry.version !== STORAGE_VERSION) {
        this.clearExportKey(sub);
        return null;
      }
      const storageKey = await this.ensureEncryptionKey();
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toBuffer(fromBase64Url(entry.iv)) },
        storageKey,
        toBuffer(fromBase64Url(entry.ciphertext))
      );
      this.updateLastAccess();
      return new Uint8Array(plaintext);
    } catch (error) {
      logger.warn(error, "Failed to load export key");
      return null;
    }
  }

  clearExportKey(sub: string): void {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${sub}`);
  }

  clearAllExportKeys(): void {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => {
      sessionStorage.removeItem(key);
    });
    sessionStorage.removeItem(METADATA_KEY);
    this.encryptionKey = null;
    this.metadata = null;
  }

  getSecurityStatus(): {
    sessionId: string;
    keyRotationCount: number;
    hasKeys: boolean;
    lastAccess: number | null;
    suspiciousActivity: boolean;
  } {
    const metadata = this.metadata ?? this.loadMetadata();
    return {
      sessionId: metadata?.sessionId || "",
      keyRotationCount: 0,
      hasKeys: !!metadata?.encryptionKey,
      lastAccess: metadata?.lastAccess ?? null,
      suspiciousActivity: false,
    };
  }
}

export const secureStorageService = new SecureStorageService();
export default secureStorageService;
