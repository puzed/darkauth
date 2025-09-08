import { eq } from "drizzle-orm";
import { authCodes } from "../db/schema.js";
import type { Context } from "../types.js";

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
    redirectUri: string;
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
    redirectUri: data.redirectUri,
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

export async function consumeAuthCode(context: Context, code: string) {
  await context.db.update(authCodes).set({ consumed: true }).where(eq(authCodes.code, code));
}
