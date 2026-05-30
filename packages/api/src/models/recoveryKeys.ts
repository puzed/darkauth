import { hash as argonHash, verify as argonVerify } from "argon2";
import { and, eq, isNull, ne } from "drizzle-orm";
import { keyEnvelopes, recoveryKeys } from "../db/schema.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString } from "../utils/crypto.ts";
import { createKeyEnvelope } from "./keybag.ts";

export type RecoveryKeyWithEnvelope = {
  recoveryKey: typeof recoveryKeys.$inferSelect;
  envelope: typeof keyEnvelopes.$inferSelect;
};

const recoveryVerifierAlg = "DarkAuth-RecoveryKey-Verifier-Argon2id-v1";

export async function createRecoveryKey(
  context: Context,
  data: {
    recoveryKeyId?: string;
    sub: string;
    keyId: string;
    envelopeId?: string;
    label?: string | null;
    wrappingAlg: string;
    wrappedKey: Buffer;
    aad: Buffer;
    verifier: Buffer;
    metadata?: Record<string, unknown>;
    revokeExisting?: boolean;
  }
): Promise<RecoveryKeyWithEnvelope> {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.keyId, "keyId");
  validateIdentifier(data.wrappingAlg, "wrappingAlg");
  validateRecoveryVerifier(data.verifier);
  const recoveryKeyId = data.recoveryKeyId ?? `rk_${generateRandomString(24)}`;
  const envelopeId = data.envelopeId ?? `env_${generateRandomString(24)}`;
  validateIdentifier(recoveryKeyId, "recoveryKeyId");
  validateIdentifier(envelopeId, "envelopeId");
  const verifierHash = await argonHash(data.verifier);
  const row = await context.db.transaction(async (tx) => {
    const txContext = { ...context, db: tx } as Context;
    const envelope = await createKeyEnvelope(txContext, {
      envelopeId,
      keyId: data.keyId,
      sub: data.sub,
      type: "recovery",
      label: normalizeLabel(data.label) ?? "Recovery key",
      wrappingAlg: data.wrappingAlg,
      wrappedKey: data.wrappedKey,
      aad: data.aad,
      metadata: {
        ...(data.metadata ?? {}),
        recovery_key_id: recoveryKeyId,
        version: String(data.metadata?.version ?? "v2"),
      },
    });
    const [recoveryKey] = await tx
      .insert(recoveryKeys)
      .values({
        recoveryKeyId,
        sub: data.sub,
        envelopeId,
        label: normalizeLabel(data.label),
        verifierHash,
        verifierAlg: recoveryVerifierAlg,
        metadata: data.metadata ?? {},
        createdAt: envelope.createdAt,
        lastUsedAt: null,
        revokedAt: null,
      })
      .returning();
    if (!recoveryKey) throw new ConflictError("Recovery key could not be created");
    if (data.revokeExisting) {
      const now = new Date();
      const replaced = await tx
        .update(recoveryKeys)
        .set({ revokedAt: now })
        .where(
          and(
            eq(recoveryKeys.sub, data.sub),
            ne(recoveryKeys.recoveryKeyId, recoveryKeyId),
            isNull(recoveryKeys.revokedAt)
          )
        )
        .returning();
      const envelopeIds = replaced.map((item) => item.envelopeId);
      if (envelopeIds.length > 0) {
        for (const oldEnvelopeId of envelopeIds) {
          await tx
            .update(keyEnvelopes)
            .set({ revokedAt: now })
            .where(
              and(
                eq(keyEnvelopes.envelopeId, oldEnvelopeId),
                eq(keyEnvelopes.sub, data.sub),
                isNull(keyEnvelopes.revokedAt)
              )
            );
        }
      }
    }
    return { recoveryKey, envelope };
  });
  return row;
}

export async function listRecoveryKeys(
  context: Context,
  sub: string,
  options: { includeRevoked?: boolean } = {}
): Promise<RecoveryKeyWithEnvelope[]> {
  validateIdentifier(sub, "sub");
  const conditions = [eq(recoveryKeys.sub, sub), eq(keyEnvelopes.sub, sub)];
  if (!options.includeRevoked) {
    conditions.push(isNull(recoveryKeys.revokedAt), isNull(keyEnvelopes.revokedAt));
  }
  const rows = await context.db
    .select({ recoveryKey: recoveryKeys, envelope: keyEnvelopes })
    .from(recoveryKeys)
    .innerJoin(keyEnvelopes, eq(recoveryKeys.envelopeId, keyEnvelopes.envelopeId))
    .where(and(...conditions));
  return rows;
}

export async function revokeRecoveryKey(
  context: Context,
  data: { sub: string; recoveryKeyId: string }
): Promise<RecoveryKeyWithEnvelope> {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.recoveryKeyId, "recoveryKeyId");
  const now = new Date();
  return await context.db.transaction(async (tx) => {
    const [recoveryKey] = await tx
      .update(recoveryKeys)
      .set({ revokedAt: now })
      .where(
        and(eq(recoveryKeys.recoveryKeyId, data.recoveryKeyId), eq(recoveryKeys.sub, data.sub))
      )
      .returning();
    if (!recoveryKey) throw new NotFoundError("Recovery key not found");
    const [envelope] = await tx
      .update(keyEnvelopes)
      .set({ revokedAt: now })
      .where(
        and(eq(keyEnvelopes.envelopeId, recoveryKey.envelopeId), eq(keyEnvelopes.sub, data.sub))
      )
      .returning();
    if (!envelope) throw new NotFoundError("Recovery key envelope not found");
    return { recoveryKey, envelope };
  });
}

export async function recordRecoveryKeyUse(
  context: Context,
  data: { sub: string; recoveryKeyId: string; verifier: Buffer }
): Promise<RecoveryKeyWithEnvelope> {
  validateIdentifier(data.sub, "sub");
  validateIdentifier(data.recoveryKeyId, "recoveryKeyId");
  validateRecoveryVerifier(data.verifier);
  const row = await getActiveRecoveryKey(context, data.sub, data.recoveryKeyId);
  const verified = await argonVerify(row.recoveryKey.verifierHash, data.verifier).catch(
    () => false
  );
  if (!verified) throw new ForbiddenError("Invalid recovery key verifier");
  const now = new Date();
  return await context.db.transaction(async (tx) => {
    const [recoveryKey] = await tx
      .update(recoveryKeys)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(recoveryKeys.recoveryKeyId, data.recoveryKeyId),
          eq(recoveryKeys.sub, data.sub),
          isNull(recoveryKeys.revokedAt)
        )
      )
      .returning();
    if (!recoveryKey) throw new NotFoundError("Recovery key not found");
    const [envelope] = await tx
      .update(keyEnvelopes)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(keyEnvelopes.envelopeId, recoveryKey.envelopeId),
          eq(keyEnvelopes.sub, data.sub),
          isNull(keyEnvelopes.revokedAt)
        )
      )
      .returning();
    if (!envelope) throw new NotFoundError("Recovery key envelope not found");
    return { recoveryKey, envelope };
  });
}

async function getActiveRecoveryKey(
  context: Context,
  sub: string,
  recoveryKeyId: string
): Promise<RecoveryKeyWithEnvelope> {
  const [row] = await context.db
    .select({ recoveryKey: recoveryKeys, envelope: keyEnvelopes })
    .from(recoveryKeys)
    .innerJoin(keyEnvelopes, eq(recoveryKeys.envelopeId, keyEnvelopes.envelopeId))
    .where(
      and(
        eq(recoveryKeys.recoveryKeyId, recoveryKeyId),
        eq(recoveryKeys.sub, sub),
        eq(keyEnvelopes.sub, sub),
        isNull(recoveryKeys.revokedAt),
        isNull(keyEnvelopes.revokedAt)
      )
    );
  if (!row) throw new NotFoundError("Recovery key not found");
  return row;
}

function validateIdentifier(value: string, name: string) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${name} is required`);
  }
}

function validateRecoveryVerifier(value: Buffer) {
  if (!Buffer.isBuffer(value) || value.length !== 32) {
    throw new ValidationError("Recovery verifier must be 32 bytes");
  }
}

function normalizeLabel(value?: string | null) {
  const label = value?.trim();
  return label ? label.slice(0, 128) : null;
}
