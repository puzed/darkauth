import { and, eq } from "drizzle-orm";
import { authCodes } from "../db/schema.ts";
import type { Context } from "../types.ts";

export async function getAuthCode(context: Context, code: string) {
  return await context.db.query.authCodes.findFirst({ where: eq(authCodes.code, code) });
}

export async function deleteAuthCode(context: Context, code: string) {
  await context.db.delete(authCodes).where(eq(authCodes.code, code));
}

export async function createAuthCode(
  context: Context,
  data: {
    code: string;
    clientId: string;
    userSub: string;
    organizationId?: string | null;
    redirectUri: string;
    nonce?: string | null;
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
    expiresAt: Date;
    hasZk?: boolean;
    zkPubKid?: string | null;
    drkHash?: string | undefined;
  }
) {
  await context.db.insert(authCodes).values({
    code: data.code,
    clientId: data.clientId,
    userSub: data.userSub,
    organizationId: data.organizationId ?? null,
    redirectUri: data.redirectUri,
    nonce: data.nonce ?? null,
    codeChallenge: data.codeChallenge ?? null,
    codeChallengeMethod: data.codeChallengeMethod ?? null,
    expiresAt: data.expiresAt,
    consumed: false,
    hasZk: data.hasZk ?? false,
    zkPubKid: data.zkPubKid ?? null,
    drkHash: data.drkHash,
    createdAt: new Date(),
  });
}

export async function consumeAuthCode(context: Context, code: string): Promise<boolean> {
  const consumedRows = await context.db
    .update(authCodes)
    .set({ consumed: true })
    .where(and(eq(authCodes.code, code), eq(authCodes.consumed, false)))
    .returning();
  return consumedRows.length > 0;
}
