import { logger } from "./logger";

const LEGACY_PREFIX = "DarkAuth_export_key:";
const SECURE_PREFIX = "DarkAuth_secure:";
const SECURE_MIGRATION_FLAG = "DarkAuth_migrated_to_secure";
const SECURE_METADATA_KEY = "DarkAuth_meta";

const memoryExportKeys = new Map<string, Uint8Array>();

export async function saveExportKey(sub: string, key: Uint8Array): Promise<void> {
  clearLegacyExportKeyStorage(sub);
  memoryExportKeys.set(sub, new Uint8Array(key));
}

export async function loadExportKey(sub: string): Promise<Uint8Array | null> {
  clearLegacyExportKeyStorage(sub);
  const key = memoryExportKeys.get(sub);
  return key ? new Uint8Array(key) : null;
}

export function clearExportKey(sub: string): void {
  memoryExportKeys.delete(sub);
  clearLegacyExportKeyStorage(sub);
}

export function clearAllExportKeys(): void {
  memoryExportKeys.clear();
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (
      key &&
      (key.startsWith(LEGACY_PREFIX) ||
        key.startsWith(SECURE_PREFIX) ||
        key.startsWith(SECURE_MIGRATION_FLAG) ||
        key === SECURE_METADATA_KEY)
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

export async function isSecureStorageAvailable(): Promise<boolean> {
  return true;
}

export function getStorageSecurityStatus(): {
  sessionId: string;
  keyRotationCount: number;
  hasKeys: boolean;
  lastAccess: number | null;
  suspiciousActivity: boolean;
} {
  return {
    sessionId: "memory",
    keyRotationCount: 0,
    hasKeys: memoryExportKeys.size > 0,
    lastAccess: null,
    suspiciousActivity: false,
  };
}

function clearLegacyExportKeyStorage(sub: string): void {
  try {
    sessionStorage.removeItem(LEGACY_PREFIX + sub);
    sessionStorage.removeItem(SECURE_MIGRATION_FLAG + sub);
    sessionStorage.removeItem(`${SECURE_PREFIX}${sub}`);
    sessionStorage.removeItem(SECURE_METADATA_KEY);
  } catch (error) {
    logger.warn(error, "Failed to clear legacy export key storage");
  }
}
