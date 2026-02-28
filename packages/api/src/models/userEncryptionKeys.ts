import { eq } from "drizzle-orm";
import { userEncryptionKeys } from "../db/schema.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";

export async function setEncPublicJwk(context: Context, sub: string, encPublicJwk: unknown) {
  if (!sub) throw new ValidationError("User sub is required");
  if (!encPublicJwk || typeof encPublicJwk !== "object")
    throw new ValidationError("enc_public_jwk required");
  const now = new Date();
  await context.db
    .insert(userEncryptionKeys)
    .values({ sub, encPublicJwk, updatedAt: now })
    .onConflictDoUpdate({ target: userEncryptionKeys.sub, set: { encPublicJwk, updatedAt: now } });
  return { success: true } as const;
}

export async function getEncPublicJwkBySub(context: Context, sub: string) {
  const row = await context.db.query.userEncryptionKeys.findFirst({
    where: eq(userEncryptionKeys.sub, sub),
  });
  if (!row) throw new NotFoundError("Not found");
  return row.encPublicJwk;
}

export async function getEncPrivateWrapped(context: Context, sub: string) {
  const row = await context.db.query.userEncryptionKeys.findFirst({
    where: eq(userEncryptionKeys.sub, sub),
  });
  if (!row || !row.encPrivateJwkWrapped) throw new NotFoundError("Not found");
  return row.encPrivateJwkWrapped;
}

export async function setEncPrivateWrapped(context: Context, sub: string, wrapped: Buffer) {
  if (!sub) throw new ValidationError("User sub is required");
  if (!wrapped) throw new ValidationError("wrapped private key required");
  const now = new Date();
  const existing = await context.db.query.userEncryptionKeys.findFirst({
    where: eq(userEncryptionKeys.sub, sub),
  });
  if (!existing) throw new NotFoundError("Public encryption key not set");
  await context.db
    .update(userEncryptionKeys)
    .set({ encPrivateJwkWrapped: wrapped, updatedAt: now })
    .where(eq(userEncryptionKeys.sub, sub));
  return { success: true } as const;
}
