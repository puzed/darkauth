import { and, eq, isNull } from "drizzle-orm";
import { accountKeys, keyEnvelopes } from "../db/schema.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { assertScimEnvelopePolicy } from "./scimPolicy.ts";

const ALLOWED_KEY_STATUSES = new Set(["active", "rotated", "revoked"]);
const ALLOWED_ENVELOPE_TYPES = new Set(["password", "passkey_prf", "trusted_device", "recovery"]);

export type AccountKeyStatus = "active" | "rotated" | "revoked";
export type KeyEnvelopeType = "password" | "passkey_prf" | "trusted_device" | "recovery";

export async function createAccountKey(
  context: Context,
  data: {
    keyId: string;
    sub: string;
    version?: string;
    status?: AccountKeyStatus;
    createdAt?: Date;
    rotatedAt?: Date | null;
  }
) {
  validateIdentifier(data.keyId, "keyId");
  validateIdentifier(data.sub, "sub");
  const status = data.status ?? "active";
  if (!ALLOWED_KEY_STATUSES.has(status)) throw new ValidationError("Invalid account key status");
  const row = {
    keyId: data.keyId,
    sub: data.sub,
    version: data.version ?? "v2",
    status,
    createdAt: data.createdAt ?? new Date(),
    rotatedAt: data.rotatedAt ?? null,
  } satisfies typeof accountKeys.$inferInsert;
  await context.db.insert(accountKeys).values(row);
  return row;
}

export async function getAccountKey(context: Context, keyId: string) {
  validateIdentifier(keyId, "keyId");
  const row = await context.db.query.accountKeys.findFirst({
    where: eq(accountKeys.keyId, keyId),
  });
  if (!row) throw new NotFoundError("Account key not found");
  return row;
}

export async function getActiveAccountKey(context: Context, sub: string) {
  validateIdentifier(sub, "sub");
  const row = await context.db.query.accountKeys.findFirst({
    where: and(eq(accountKeys.sub, sub), eq(accountKeys.status, "active")),
  });
  if (!row) throw new NotFoundError("Account key not found");
  return row;
}

export async function listAccountKeys(context: Context, sub: string) {
  validateIdentifier(sub, "sub");
  return await context.db.query.accountKeys.findMany({
    where: eq(accountKeys.sub, sub),
  });
}

export async function createKeyEnvelope(
  context: Context,
  data: {
    envelopeId: string;
    keyId: string;
    sub: string;
    type: KeyEnvelopeType;
    label?: string | null;
    wrappingAlg: string;
    wrappedKey: Buffer;
    aad: Buffer;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
  }
) {
  validateIdentifier(data.envelopeId, "envelopeId");
  validateIdentifier(data.keyId, "keyId");
  validateIdentifier(data.sub, "sub");
  if (!ALLOWED_ENVELOPE_TYPES.has(data.type)) throw new ValidationError("Invalid envelope type");
  if (!data.wrappingAlg.trim()) throw new ValidationError("wrappingAlg is required");
  validateCiphertext(data.wrappedKey, "wrappedKey");
  validateCiphertext(data.aad, "aad");

  const accountKey = await getAccountKey(context, data.keyId);
  if (accountKey.sub !== data.sub) throw new ValidationError("Envelope subject mismatch");
  await assertScimEnvelopePolicy(context, data.sub, data.type);

  const row = {
    envelopeId: data.envelopeId,
    keyId: data.keyId,
    sub: data.sub,
    type: data.type,
    label: data.label ?? null,
    wrappingAlg: data.wrappingAlg,
    wrappedKey: data.wrappedKey,
    aad: data.aad,
    metadata: data.metadata ?? {},
    createdAt: data.createdAt ?? new Date(),
    lastUsedAt: null,
    revokedAt: null,
  } satisfies typeof keyEnvelopes.$inferInsert;
  await context.db.insert(keyEnvelopes).values(row);
  return row;
}

export async function listKeyEnvelopes(
  context: Context,
  sub: string,
  options: { includeRevoked?: boolean; type?: KeyEnvelopeType } = {}
) {
  validateIdentifier(sub, "sub");
  if (options.type && !ALLOWED_ENVELOPE_TYPES.has(options.type)) {
    throw new ValidationError("Invalid envelope type");
  }
  const conditions = [eq(keyEnvelopes.sub, sub)];
  if (!options.includeRevoked) conditions.push(isNull(keyEnvelopes.revokedAt));
  if (options.type) conditions.push(eq(keyEnvelopes.type, options.type));
  return await context.db.query.keyEnvelopes.findMany({
    where: and(...conditions),
  });
}

export async function revokeKeyEnvelope(context: Context, envelopeId: string, sub: string) {
  validateIdentifier(envelopeId, "envelopeId");
  validateIdentifier(sub, "sub");
  const rows = await context.db
    .update(keyEnvelopes)
    .set({ revokedAt: new Date() })
    .where(and(eq(keyEnvelopes.envelopeId, envelopeId), eq(keyEnvelopes.sub, sub)))
    .returning();
  const row = rows[0];
  if (!row) throw new NotFoundError("Key envelope not found");
  return row;
}

export async function migrateLegacyWrappedDrkToKeybag(
  context: Context,
  data: {
    sub: string;
    wrappedDrk: Buffer;
    updatedAt?: Date;
  }
) {
  validateIdentifier(data.sub, "sub");
  validateCiphertext(data.wrappedDrk, "wrappedDrk");
  const createdAt = data.updatedAt ?? new Date();
  const keyId = `legacy-drk:${data.sub}`;
  const envelopeId = `legacy-drk-password:${data.sub}`;

  await context.db
    .insert(accountKeys)
    .values({
      keyId,
      sub: data.sub,
      version: "v1-drk",
      status: "active",
      createdAt,
      rotatedAt: null,
    })
    .onConflictDoNothing({ target: accountKeys.keyId });

  await context.db
    .insert(keyEnvelopes)
    .values({
      envelopeId,
      keyId,
      sub: data.sub,
      type: "password",
      label: "Legacy password envelope",
      wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM/v1",
      wrappedKey: data.wrappedDrk,
      aad: Buffer.from(data.sub),
      metadata: { version: "v1-drk", migrated_from: "wrapped_root_keys" },
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    })
    .onConflictDoNothing({ target: keyEnvelopes.envelopeId });

  return { keyId, envelopeId } as const;
}

function validateIdentifier(value: string, name: string) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${name} is required`);
  }
}

function validateCiphertext(value: Buffer, name: string) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 1024 * 1024) {
    throw new ValidationError(`${name} must be a non-empty buffer`);
  }
}
