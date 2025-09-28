import { fromBase64Url, toBase64Url } from "./crypto";
import { logger } from "./logger";
import secureStorageService from "./secureStorage";

// Legacy fallback prefix for migration
const LEGACY_PREFIX = "DarkAuth_export_key:";
const SECURE_MIGRATION_FLAG = "DarkAuth_migrated_to_secure";

// Migration helper to move from legacy to secure storage
async function migrateToSecureStorage(sub: string): Promise<void> {
  const legacyKey = LEGACY_PREFIX + sub;
  const legacyValue = sessionStorage.getItem(legacyKey);

  if (legacyValue && !sessionStorage.getItem(SECURE_MIGRATION_FLAG + sub)) {
    try {
      const key = fromBase64Url(legacyValue);
      await secureStorageService.saveExportKey(sub, key);

      // Clear legacy data and mark as migrated
      sessionStorage.removeItem(legacyKey);
      sessionStorage.setItem(SECURE_MIGRATION_FLAG + sub, "true");

      // Clear the key from memory
      key.fill(0);
    } catch (error) {
      logger.warn(error, "Failed to migrate key to secure storage");
    }
  }
}

// Enhanced export key storage with XSS protection
export async function saveExportKey(sub: string, key: Uint8Array): Promise<void> {
  try {
    // Use secure storage
    await secureStorageService.saveExportKey(sub, key);
    sessionStorage.setItem(SECURE_MIGRATION_FLAG + sub, "true");
  } catch (error) {
    logger.warn(error, "Failed to use secure storage, falling back");

    // Fallback to enhanced basic storage with integrity check
    const now = Date.now();
    const integrity = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${sub}|${toBase64Url(key)}|${now}`)
    );

    const entry = {
      key: toBase64Url(key),
      timestamp: now,
      integrity: toBase64Url(integrity),
      version: 1,
    };

    sessionStorage.setItem(LEGACY_PREFIX + sub, JSON.stringify(entry));
  }
}

export async function loadExportKey(sub: string): Promise<Uint8Array | null> {
  // Try migration first
  await migrateToSecureStorage(sub);

  try {
    // Try secure storage first
    const secureKey = await secureStorageService.loadExportKey(sub);
    if (secureKey) {
      return secureKey;
    }
  } catch (error) {
    logger.warn(error, "Failed to load from secure storage");
  }

  // Fallback to legacy storage with integrity check
  const legacyValue = sessionStorage.getItem(LEGACY_PREFIX + sub);
  if (!legacyValue) return null;

  try {
    const entry = JSON.parse(legacyValue);

    // Handle old format (direct base64 string)
    if (typeof entry === "string") {
      return fromBase64Url(entry);
    }

    // Handle new format with integrity check
    if (entry.version === 1 && entry.integrity) {
      const expectedIntegrity = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${sub}|${entry.key}|${entry.timestamp}`)
      );

      if (toBase64Url(expectedIntegrity) !== entry.integrity) {
        logger.warn({ sub }, "Export key integrity check failed");
        clearExportKey(sub);
        return null;
      }

      // Check age (30 minutes)
      if (Date.now() - entry.timestamp > 30 * 60 * 1000) {
        logger.warn({ sub }, "Export key expired");
        clearExportKey(sub);
        return null;
      }
    }

    return fromBase64Url(entry.key || entry);
  } catch (error) {
    logger.warn(error, "Failed to parse export key");
    clearExportKey(sub);
    return null;
  }
}

export function clearExportKey(sub: string): void {
  // Clear from both secure and legacy storage
  secureStorageService.clearExportKey(sub);
  sessionStorage.removeItem(LEGACY_PREFIX + sub);
  sessionStorage.removeItem(SECURE_MIGRATION_FLAG + sub);
}

// Clear all export keys (useful for logout)
export function clearAllExportKeys(): void {
  secureStorageService.clearAllExportKeys();

  // Also clear legacy keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.startsWith(LEGACY_PREFIX) || key.startsWith(SECURE_MIGRATION_FLAG))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

// Utility to check if secure storage is available and working
export async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    const status = secureStorageService.getSecurityStatus();
    return status.sessionId.length > 0;
  } catch {
    return false;
  }
}

// Get security status for debugging
export function getStorageSecurityStatus(): ReturnType<
  typeof secureStorageService.getSecurityStatus
> {
  return secureStorageService.getSecurityStatus();
}
