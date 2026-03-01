import { eq, inArray } from "drizzle-orm";
import { settings } from "../db/schema.ts";
import type { Context } from "../types.ts";

function resolveSettingsDb(context: Context) {
  return context.services.install?.tempDb || context.db;
}

const DEPRECATED_SETTING_KEYS = [
  "admin_session.refresh_lifetime_seconds",
  "code",
  "code.single_use",
  "code.lifetime_seconds",
  "pkce",
  "pkce.required_for_public_clients",
  "pkce.methods",
  "id_token",
  "id_token.lifetime_seconds",
  "access_token",
  "access_token.enabled",
  "access_token.lifetime_seconds",
] as const;

export async function getSetting(context: Context, key: string): Promise<unknown> {
  const db = resolveSettingsDb(context);
  if (!db) return undefined;
  const result = await db.query.settings.findFirst({
    where: eq(settings.key, key),
  });

  return result?.value;
}

export async function setSetting(
  context: Context,
  key: string,
  value: unknown,
  secure = false
): Promise<void> {
  const db = resolveSettingsDb(context);
  if (!db) {
    throw new Error("Database not prepared");
  }
  await db
    .insert(settings)
    .values({
      key,
      value,
      secure,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value,
        secure,
        updatedAt: new Date(),
      },
    });
}

export async function getAllSettings(context: Context): Promise<Record<string, unknown>> {
  const db = resolveSettingsDb(context);
  if (!db) return {};
  const results = await db.query.settings.findMany();

  const settingsMap: Record<string, unknown> = {};
  for (const setting of results) {
    const key = setting.key as string;
    if (key) {
      settingsMap[key] = setting.value;
    }
  }

  return settingsMap;
}

export async function isSystemInitialized(context: Context): Promise<boolean> {
  try {
    const initialized = await getSetting(context, "initialized");
    return initialized === true;
  } catch (_error) {
    return false;
  }
}

export async function markSystemInitialized(context: Context): Promise<void> {
  await setSetting(context, "initialized", true);
}

export async function pruneDeprecatedSettings(context: Context): Promise<void> {
  const db = resolveSettingsDb(context);
  if (!db) return;

  if (DEPRECATED_SETTING_KEYS.length > 0) {
    await db.delete(settings).where(inArray(settings.key, [...DEPRECATED_SETTING_KEYS]));
  }

  const adminSession = await db.query.settings.findFirst({
    where: eq(settings.key, "admin_session"),
  });
  if (!adminSession || typeof adminSession.value !== "object" || adminSession.value === null) {
    return;
  }
  const currentValue = adminSession.value as Record<string, unknown>;
  if (!("refresh_lifetime_seconds" in currentValue)) {
    return;
  }

  const { refresh_lifetime_seconds: _ignoreValue, ...nextValue } = currentValue;
  const currentDefault =
    typeof adminSession.defaultValue === "object" && adminSession.defaultValue !== null
      ? (adminSession.defaultValue as Record<string, unknown>)
      : undefined;
  const nextDefault = currentDefault
    ? (({ refresh_lifetime_seconds: _ignoreDefault, ...rest }) => rest)(currentDefault)
    : adminSession.defaultValue;

  await db
    .update(settings)
    .set({
      value: nextValue,
      defaultValue: nextDefault,
      updatedAt: new Date(),
    })
    .where(eq(settings.key, "admin_session"));
}

export async function loadRuntimeConfig(context: Context): Promise<{
  issuer: string;
  publicOrigin: string;
  rpId: string;
}> {
  const [issuer, publicOrigin, rpId] = await Promise.all([
    getSetting(context, "issuer"),
    getSetting(context, "public_origin"),
    getSetting(context, "rp_id"),
  ]);

  return {
    issuer: (issuer as string) || "http://localhost:9080",
    publicOrigin: (publicOrigin as string) || "http://localhost:9080",
    rpId: (rpId as string) || "localhost",
  };
}
