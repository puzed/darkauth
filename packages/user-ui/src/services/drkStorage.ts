import { logger } from "./logger";

const STORAGE_PREFIX = "DarkAuth_drk:";

export function clearAllDrk(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch (error) {
    logger.warn(error, "Failed to clear legacy DRK storage");
  }
}
