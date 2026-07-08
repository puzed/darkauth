import { and, eq } from "drizzle-orm";
import { authCodes, scimUsers } from "../db/schema.ts";
import { ServerError } from "../errors.ts";
import type { Context } from "../types.ts";

export async function getAuthCode(context: Context, code: string) {
  const authCode = await context.db.query.authCodes.findFirst({ where: eq(authCodes.code, code) });
  if (!authCode) return null;
  const scimRows = await context.db.query.scimUsers.findMany({
    where: eq(scimUsers.userSub, authCode.userSub),
  });
  const scopedRow = authCode.organizationId
    ? scimRows.find((row) => row.organizationId === authCode.organizationId)
    : null;
  if (scopedRow && !scopedRow.active) return null;
  if (!scopedRow && scimRows.length > 0 && scimRows.every((row) => !row.active)) return null;
  return authCode;
}

export async function deleteAuthCode(context: Context, code: string) {
  await context.db.delete(authCodes).where(eq(authCodes.code, code));
}

export async function deleteAuthCodesForUser(context: Context, userSub: string) {
  await context.db.delete(authCodes).where(eq(authCodes.userSub, userSub));
}

export async function createAuthCode(
  context: Context,
  data: {
    code: string;
    clientId: string;
    userSub: string;
    organizationId?: string | null;
    redirectUri: string;
    scope: string;
    nonce?: string | null;
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
    expiresAt: Date;
    hasZk?: boolean;
    zkPubKid?: string | null;
    drkHash?: string | undefined;
    zkKeyHash?: string | undefined;
    zkKeyKind?: string | undefined;
    zkKeyVersion?: string | undefined;
    requireOrganizationSelection?: boolean;
  }
) {
  try {
    await context.db.insert(authCodes).values({
      code: data.code,
      clientId: data.clientId,
      userSub: data.userSub,
      organizationId: data.organizationId ?? null,
      redirectUri: data.redirectUri,
      scope: data.scope,
      nonce: data.nonce ?? null,
      codeChallenge: data.codeChallenge ?? null,
      codeChallengeMethod: data.codeChallengeMethod ?? null,
      expiresAt: data.expiresAt,
      consumed: false,
      hasZk: data.hasZk ?? false,
      zkPubKid: data.zkPubKid ?? null,
      drkHash: data.drkHash,
      zkKeyHash: data.zkKeyHash,
      zkKeyKind: data.zkKeyKind,
      zkKeyVersion: data.zkKeyVersion,
      requireOrganizationSelection: data.requireOrganizationSelection ?? true,
      createdAt: new Date(),
    });
  } catch (error) {
    if (isAuthCodesSchemaDrift(error)) {
      throw new ServerError("DarkAuth database schema is out of date; run migrations");
    }
    throw error;
  }
}

function isAuthCodesSchemaDrift(error: unknown): boolean {
  for (let current: unknown = error; current; current = getErrorCause(current)) {
    const candidate = current as { code?: unknown; message?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (candidate.code === "42703" && message.includes("auth_codes")) {
      return true;
    }
  }
  return false;
}

function getErrorCause(error: unknown): unknown {
  return error && typeof error === "object" && "cause" in error
    ? (error as { cause?: unknown }).cause
    : undefined;
}

export async function consumeAuthCode(context: Context, code: string): Promise<boolean> {
  const consumedRows = await context.db
    .update(authCodes)
    .set({ consumed: true })
    .where(and(eq(authCodes.code, code), eq(authCodes.consumed, false)))
    .returning();
  return consumedRows.length > 0;
}
