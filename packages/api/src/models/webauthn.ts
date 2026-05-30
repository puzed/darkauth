import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { keyEnvelopes, webauthnChallenges, webauthnCredentials } from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomBytes, generateRandomString } from "../utils/crypto.ts";
import { createKeyEnvelope } from "./keybag.ts";

const CHALLENGE_TYPES = new Set(["registration", "login"]);
const TRANSPORTS = new Set(["usb", "nfc", "ble", "hybrid", "internal", "cable", "smart-card"]);

export type WebAuthnChallengeType = "registration" | "login";

export async function createWebAuthnChallenge(
  context: Context,
  data: {
    type: WebAuthnChallengeType;
    sub?: string | null;
    credentialId?: string | null;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }
) {
  if (!CHALLENGE_TYPES.has(data.type)) throw new ValidationError("Invalid challenge type");
  if (data.sub !== undefined && data.sub !== null) validateIdentifier(data.sub, "sub");
  if (data.credentialId !== undefined && data.credentialId !== null) {
    validateIdentifier(data.credentialId, "credentialId");
  }
  const ttlMs = data.ttlMs ?? 5 * 60 * 1000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 15 * 60 * 1000) {
    throw new ValidationError("Invalid challenge ttl");
  }
  const row = {
    challengeId: `wch_${generateRandomString(24)}`,
    type: data.type,
    challenge: generateRandomBytes(32).toString("base64url"),
    sub: data.sub ?? null,
    credentialId: data.credentialId ?? null,
    metadata: data.metadata ?? {},
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
    consumedAt: null,
  } satisfies typeof webauthnChallenges.$inferInsert;
  await context.db.insert(webauthnChallenges).values(row);
  return row;
}

export async function consumeWebAuthnChallenge(
  context: Context,
  data: { challenge: string; type: WebAuthnChallengeType }
) {
  validateIdentifier(data.challenge, "challenge");
  if (!CHALLENGE_TYPES.has(data.type)) throw new ValidationError("Invalid challenge type");
  const rows = await context.db
    .update(webauthnChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(webauthnChallenges.challenge, data.challenge),
        eq(webauthnChallenges.type, data.type),
        isNull(webauthnChallenges.consumedAt),
        gt(webauthnChallenges.expiresAt, new Date())
      )
    )
    .returning();
  const row = rows[0];
  if (!row) throw new NotFoundError("WebAuthn challenge not found");
  return row;
}

export async function createWebAuthnCredential(
  context: Context,
  data: {
    credentialId: string;
    sub: string;
    publicKey: Buffer;
    label?: string | null;
    signCount?: number;
    transports?: string[];
    aaguid?: string | null;
    backupEligible?: boolean;
    backupState?: boolean;
    userVerified?: boolean;
    prfSupported?: boolean;
    prfSalt?: Buffer | null;
  }
) {
  validateIdentifier(data.credentialId, "credentialId");
  validateIdentifier(data.sub, "sub");
  validatePublicKey(data.publicKey);
  const transports = validateTransports(data.transports ?? []);
  const row = {
    credentialId: data.credentialId,
    sub: data.sub,
    label: data.label ?? null,
    publicKey: data.publicKey,
    signCount: data.signCount ?? 0,
    transports,
    aaguid: data.aaguid ?? null,
    backupEligible: data.backupEligible ?? false,
    backupState: data.backupState ?? false,
    userVerified: data.userVerified ?? false,
    prfSupported: data.prfSupported ?? false,
    prfSalt: data.prfSalt ?? null,
    prfEnvelopeId: null,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  } satisfies typeof webauthnCredentials.$inferInsert;
  await context.db.insert(webauthnCredentials).values(row);
  return row;
}

export async function getWebAuthnCredential(context: Context, credentialId: string) {
  validateIdentifier(credentialId, "credentialId");
  const row = await context.db.query.webauthnCredentials.findFirst({
    where: eq(webauthnCredentials.credentialId, credentialId),
  });
  if (!row) throw new NotFoundError("WebAuthn credential not found");
  return row;
}

export async function getWebAuthnChallenge(context: Context, challengeId: string) {
  validateIdentifier(challengeId, "challengeId");
  const row = await context.db.query.webauthnChallenges.findFirst({
    where: eq(webauthnChallenges.challengeId, challengeId),
  });
  if (!row) throw new NotFoundError("WebAuthn challenge not found");
  return row;
}

export async function listWebAuthnCredentials(
  context: Context,
  sub: string,
  options: { includeRevoked?: boolean } = {}
) {
  validateIdentifier(sub, "sub");
  const conditions = [eq(webauthnCredentials.sub, sub)];
  if (!options.includeRevoked) conditions.push(isNull(webauthnCredentials.revokedAt));
  return await context.db.query.webauthnCredentials.findMany({
    where: and(...conditions),
  });
}

export async function revokeWebAuthnCredential(
  context: Context,
  data: { credentialId: string; sub: string }
) {
  validateIdentifier(data.credentialId, "credentialId");
  validateIdentifier(data.sub, "sub");
  const now = new Date();
  return await context.db.transaction(async (tx) => {
    const [credential] = await tx
      .update(webauthnCredentials)
      .set({ revokedAt: now })
      .where(
        and(
          eq(webauthnCredentials.credentialId, data.credentialId),
          eq(webauthnCredentials.sub, data.sub),
          isNull(webauthnCredentials.revokedAt)
        )
      )
      .returning();
    if (!credential) throw new NotFoundError("WebAuthn credential not found");
    if (credential.prfEnvelopeId) {
      await tx
        .update(keyEnvelopes)
        .set({ revokedAt: now })
        .where(
          and(
            eq(keyEnvelopes.envelopeId, credential.prfEnvelopeId),
            eq(keyEnvelopes.sub, data.sub),
            isNull(keyEnvelopes.revokedAt)
          )
        );
    }
    return credential;
  });
}

export async function updateWebAuthnCredentialUsage(
  context: Context,
  data: { credentialId: string; sub: string; signCount: number }
) {
  validateIdentifier(data.credentialId, "credentialId");
  validateIdentifier(data.sub, "sub");
  if (!Number.isSafeInteger(data.signCount) || data.signCount < 0) {
    throw new ValidationError("Invalid sign count");
  }
  const rows = await context.db
    .update(webauthnCredentials)
    .set({ signCount: data.signCount, lastUsedAt: new Date() })
    .where(
      and(
        eq(webauthnCredentials.credentialId, data.credentialId),
        eq(webauthnCredentials.sub, data.sub),
        isNull(webauthnCredentials.revokedAt)
      )
    )
    .returning();
  const row = rows[0];
  if (!row) throw new NotFoundError("WebAuthn credential not found");
  return row;
}

export async function createPasskeyPrfEnvelope(
  context: Context,
  data: {
    credentialId: string;
    sub: string;
    keyId: string;
    envelopeId: string;
    label?: string | null;
    wrappingAlg: string;
    wrappedKey: Buffer;
    aad: Buffer;
    prfSalt: Buffer;
    prfResultConfirmed: boolean;
    metadata?: Record<string, unknown>;
  }
) {
  if (!data.prfResultConfirmed) throw new ValidationError("PRF result confirmation is required");
  validateCiphertext(data.prfSalt, "prfSalt");
  const credential = await getWebAuthnCredential(context, data.credentialId);
  if (credential.sub !== data.sub) throw new ValidationError("Credential subject mismatch");
  if (credential.revokedAt) throw new ValidationError("Credential is revoked");
  if (!credential.prfSupported) throw new ValidationError("Credential is auth-only");
  if (credential.prfEnvelopeId) throw new ConflictError("Credential already has a PRF envelope");
  const envelope = await createKeyEnvelope(context, {
    envelopeId: data.envelopeId,
    keyId: data.keyId,
    sub: data.sub,
    type: "passkey_prf",
    label: data.label ?? null,
    wrappingAlg: data.wrappingAlg,
    wrappedKey: data.wrappedKey,
    aad: data.aad,
    metadata: {
      ...(data.metadata ?? {}),
      credential_id: data.credentialId,
      prf_result_confirmed: true,
    },
  });
  await context.db
    .update(webauthnCredentials)
    .set({ prfSalt: data.prfSalt, prfEnvelopeId: envelope.envelopeId })
    .where(
      and(
        eq(webauthnCredentials.credentialId, data.credentialId),
        eq(webauthnCredentials.sub, data.sub),
        isNull(webauthnCredentials.prfEnvelopeId)
      )
    );
  return envelope;
}

export async function listPasskeyPrfUnlockCandidates(context: Context) {
  return await context.db
    .select({ credential: webauthnCredentials, envelope: keyEnvelopes })
    .from(webauthnCredentials)
    .innerJoin(keyEnvelopes, eq(webauthnCredentials.prfEnvelopeId, keyEnvelopes.envelopeId))
    .where(
      and(
        eq(webauthnCredentials.prfSupported, true),
        isNotNull(webauthnCredentials.prfSalt),
        isNotNull(webauthnCredentials.prfEnvelopeId),
        isNull(webauthnCredentials.revokedAt),
        eq(keyEnvelopes.type, "passkey_prf"),
        isNull(keyEnvelopes.revokedAt)
      )
    );
}

export async function getPasskeyPrfUnlockMaterial(
  context: Context,
  data: { credentialId: string; sub: string }
) {
  validateIdentifier(data.credentialId, "credentialId");
  validateIdentifier(data.sub, "sub");
  const [row] = await context.db
    .select({ credential: webauthnCredentials, envelope: keyEnvelopes })
    .from(webauthnCredentials)
    .innerJoin(keyEnvelopes, eq(webauthnCredentials.prfEnvelopeId, keyEnvelopes.envelopeId))
    .where(
      and(
        eq(webauthnCredentials.credentialId, data.credentialId),
        eq(webauthnCredentials.sub, data.sub),
        eq(webauthnCredentials.prfSupported, true),
        isNotNull(webauthnCredentials.prfSalt),
        isNotNull(webauthnCredentials.prfEnvelopeId),
        isNull(webauthnCredentials.revokedAt),
        eq(keyEnvelopes.sub, data.sub),
        eq(keyEnvelopes.type, "passkey_prf"),
        isNull(keyEnvelopes.revokedAt)
      )
    );
  if (!row) throw new NotFoundError("Passkey PRF envelope not found");
  return row;
}

export function credentialCanUnlockWithPrf(row: {
  prfSupported: boolean;
  prfEnvelopeId: string | null;
}) {
  return row.prfSupported && Boolean(row.prfEnvelopeId);
}

function validateIdentifier(value: string, name: string) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${name} is required`);
  }
}

function validatePublicKey(value: Buffer) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 16 * 1024) {
    throw new ValidationError("publicKey must be a non-empty buffer");
  }
}

function validateCiphertext(value: Buffer, name: string) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 1024 * 1024) {
    throw new ValidationError(`${name} must be a non-empty buffer`);
  }
}

function validateTransports(value: string[]) {
  if (!Array.isArray(value)) throw new ValidationError("transports must be an array");
  for (const transport of value) {
    if (!TRANSPORTS.has(transport)) throw new ValidationError("Invalid authenticator transport");
  }
  return [...new Set(value)];
}
