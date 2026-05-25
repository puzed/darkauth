import { createHmac } from "node:crypto";
import { and, count, eq, gt, gte, isNull } from "drizzle-orm";
import { passwordResetTokens } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";

export interface PasswordResetTokenRow {
  id: string;
  userSub: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export function hashPasswordResetToken(context: Context, token: string): string {
  const pepper = context.config?.kekPassphrase || context.config?.installToken || "DarkAuth";
  return createHmac("sha256", pepper).update(token).digest("base64url");
}

export async function invalidateActivePasswordResetTokens(
  context: Context,
  userSub: string
): Promise<void> {
  await context.db
    .update(passwordResetTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userSub, userSub),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    );
}

export async function createPasswordResetToken(
  context: Context,
  params: {
    userSub: string;
    email: string;
    ttlMinutes: number;
    requestedIp?: string;
    userAgent?: string;
  }
): Promise<{ token: string; expiresAt: Date }> {
  await invalidateActivePasswordResetTokens(context, params.userSub);
  const token = generateRandomString(48);
  const tokenHash = hashPasswordResetToken(context, token);
  const expiresAt = new Date(Date.now() + Math.max(1, params.ttlMinutes) * 60 * 1000);
  await context.db.insert(passwordResetTokens).values({
    userSub: params.userSub,
    email: params.email,
    tokenHash,
    expiresAt,
    requestedIpHash: params.requestedIp ? sha256Base64Url(params.requestedIp) : null,
    userAgentHash: params.userAgent ? sha256Base64Url(params.userAgent) : null,
    createdAt: new Date(),
  });
  return { token, expiresAt };
}

export async function getActivePasswordResetToken(
  context: Context,
  token: string
): Promise<PasswordResetTokenRow> {
  const tokenHash = hashPasswordResetToken(context, token);
  const row = await context.db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.tokenHash, tokenHash),
  });
  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    throw new ValidationError("This password reset link is invalid or expired.");
  }
  return row;
}

export async function getLatestPasswordResetTokenForUser(
  context: Context,
  userSub: string
): Promise<PasswordResetTokenRow | null> {
  return (
    (await context.db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.userSub, userSub),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    })) || null
  );
}

export async function countPasswordResetTokensSince(
  context: Context,
  userSub: string,
  since: Date
): Promise<number> {
  const [row] = await context.db
    .select({ value: count() })
    .from(passwordResetTokens)
    .where(
      and(eq(passwordResetTokens.userSub, userSub), gte(passwordResetTokens.createdAt, since))
    );
  return Number(row?.value || 0);
}
