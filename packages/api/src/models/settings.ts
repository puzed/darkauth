import { eq } from "drizzle-orm";
import { settings } from "../db/schema.js";
import { ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export interface SettingValue {
  key: string;
  value: any;
  type: "string" | "number" | "boolean" | "object" | "array";
}

export interface SettingsUpdate {
  [key: string]: any;
}

/**
 * Gets all settings as a key-value object
 */
export async function getAllSettings(context: Context): Promise<Record<string, any>> {
  const results = await context.db.query.settings.findMany();
  
  const settingsMap: Record<string, any> = {};
  
  for (const setting of results) {
    try {
      settingsMap[setting.key] = JSON.parse(setting.value);
    } catch {
      settingsMap[setting.key] = setting.value;
    }
  }
  
  return settingsMap;
}

/**
 * Gets a specific setting value
 */
export async function getSetting(context: Context, key: string): Promise<any> {
  const result = await context.db.query.settings.findFirst({
    where: eq(settings.key, key),
  });

  if (!result) {
    return null;
  }

  try {
    return JSON.parse(result.value);
  } catch {
    return result.value;
  }
}

/**
 * Sets a specific setting value
 */
export async function setSetting(
  context: Context, 
  key: string, 
  value: any
): Promise<void> {
  validateSettingKey(key);
  validateSettingValue(key, value);

  const serializedValue = typeof value === "string" ? value : JSON.stringify(value);

  await context.db.insert(settings).values({
    key,
    value: serializedValue,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [settings.key],
    set: {
      value: serializedValue,
      updatedAt: new Date(),
    },
  });

  // Clear rate limit cache if rate limit settings changed
  if (key.startsWith("rate_limit.")) {
    await context.services.cache?.clear("rate_limit:*");
  }
}

/**
 * Updates multiple settings at once
 */
export async function updateSettings(
  context: Context,
  updates: SettingsUpdate
): Promise<void> {
  const validatedUpdates: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(updates)) {
    validateSettingKey(key);
    validateSettingValue(key, value);

    const serializedValue = typeof value === "string" ? value : JSON.stringify(value);
    validatedUpdates.push({ key, value: serializedValue });
  }

  // Perform updates in a transaction-like manner
  const now = new Date();
  
  for (const update of validatedUpdates) {
    await context.db.insert(settings).values({
      key: update.key,
      value: update.value,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [settings.key],
      set: {
        value: update.value,
        updatedAt: now,
      },
    });
  }

  // Clear caches if needed
  const hasRateLimitChanges = validatedUpdates.some(u => u.key.startsWith("rate_limit."));
  if (hasRateLimitChanges) {
    await context.services.cache?.clear("rate_limit:*");
  }
}

/**
 * Deletes a setting
 */
export async function deleteSetting(context: Context, key: string): Promise<boolean> {
  const result = await context.db.delete(settings).where(eq(settings.key, key)).returning();
  return result.length > 0;
}

/**
 * Validates setting key format
 */
function validateSettingKey(key: string): void {
  if (!key || typeof key !== "string") {
    throw new ValidationError("Setting key must be a non-empty string");
  }

  if (key.length > 255) {
    throw new ValidationError("Setting key too long (max 255 characters)");
  }

  if (!/^[a-zA-Z0-9_./-]+$/.test(key)) {
    throw new ValidationError("Setting key contains invalid characters");
  }
}

/**
 * Validates setting value based on key and type
 */
function validateSettingValue(key: string, value: any): void {
  if (value === undefined) {
    throw new ValidationError("Setting value cannot be undefined");
  }

  // Key-specific validations
  if (key.includes("lifetime_seconds") || key.includes("ttl")) {
    if (typeof value !== "number" || value < 0) {
      throw new ValidationError("Lifetime values must be positive numbers");
    }
  }

  if (key.includes("rate_limit")) {
    if (typeof value === "object" && value !== null) {
      if (value.requests !== undefined && (typeof value.requests !== "number" || value.requests < 0)) {
        throw new ValidationError("Rate limit requests must be a positive number");
      }
      if (value.window !== undefined && (typeof value.window !== "number" || value.window < 0)) {
        throw new ValidationError("Rate limit window must be a positive number");
      }
    }
  }

  if (key.includes("url") || key.includes("uri")) {
    if (typeof value === "string") {
      try {
        new URL(value);
      } catch {
        throw new ValidationError(`Invalid URL format for ${key}`);
      }
    }
  }

  // Size limit for serialized value
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized.length > 65535) {
    throw new ValidationError("Setting value too large (max 64KB)");
  }
}

/**
 * Gets settings with type information
 */
export async function getSettingsWithTypes(context: Context): Promise<SettingValue[]> {
  const results = await context.db.query.settings.findMany();
  
  return results.map(setting => {
    let parsedValue: any;
    let type: SettingValue["type"] = "string";
    
    try {
      parsedValue = JSON.parse(setting.value);
      
      if (Array.isArray(parsedValue)) {
        type = "array";
      } else if (typeof parsedValue === "object" && parsedValue !== null) {
        type = "object";
      } else if (typeof parsedValue === "number") {
        type = "number";
      } else if (typeof parsedValue === "boolean") {
        type = "boolean";
      } else {
        type = "string";
      }
    } catch {
      parsedValue = setting.value;
      type = "string";
    }
    
    return {
      key: setting.key,
      value: parsedValue,
      type,
    };
  });
}

/**
 * Bulk import settings from an object
 */
export async function importSettings(
  context: Context,
  settingsData: Record<string, any>,
  options: { overwrite?: boolean } = {}
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(settingsData)) {
    try {
      // Check if setting exists if overwrite is false
      if (!options.overwrite) {
        const existing = await getSetting(context, key);
        if (existing !== null) {
          skipped++;
          continue;
        }
      }

      await setSetting(context, key, value);
      imported++;
    } catch (error) {
      console.warn(`Failed to import setting ${key}:`, error);
      skipped++;
    }
  }

  return { imported, skipped };
}