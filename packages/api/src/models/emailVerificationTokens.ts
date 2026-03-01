import { and, eq, gt, isNull } from "drizzle-orm";
import { emailVerificationTokens } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";

export type EmailVerificationPurpose = "signup_verify" | "email_change_verify";

export interface CreateEmailVerificationTokenParams {
  userSub: string;
  purpose: EmailVerificationPurpose;
  targetEmail: string;
  ttlMinutes: number;
}

export async function invalidateActiveEmailVerificationTokens(
  context: Context,
  userSub: string,
  purpose: EmailVerificationPurpose
): Promise<void> {
  await context.db
    .update(emailVerificationTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.userSub, userSub),
        eq(emailVerificationTokens.purpose, purpose),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    );
}

export async function createEmailVerificationToken(
  context: Context,
  params: CreateEmailVerificationTokenParams
): Promise<{ token: string; expiresAt: Date }> {
  const ttlMinutes = Math.max(1, params.ttlMinutes);
  await invalidateActiveEmailVerificationTokens(context, params.userSub, params.purpose);

  const token = generateRandomString(48);
  const tokenHash = sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await context.db.insert(emailVerificationTokens).values({
    userSub: params.userSub,
    purpose: params.purpose,
    targetEmail: params.targetEmail,
    tokenHash,
    expiresAt,
    createdAt: new Date(),
  });

  return { token, expiresAt };
}

export async function consumeEmailVerificationToken(
  context: Context,
  token: string
): Promise<{
  id: string;
  userSub: string;
  purpose: EmailVerificationPurpose;
  targetEmail: string;
}> {
  const tokenHash = sha256Base64Url(token);
  const row = await context.db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.tokenHash, tokenHash),
  });

  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    throw new ValidationError("Verification link is invalid or expired");
  }

  await context.db
    .update(emailVerificationTokens)
    .set({ consumedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id));

  if (row.purpose !== "signup_verify" && row.purpose !== "email_change_verify") {
    throw new ValidationError("Verification link is invalid or expired");
  }

  return {
    id: row.id,
    userSub: row.userSub,
    purpose: row.purpose,
    targetEmail: row.targetEmail,
  };
}
