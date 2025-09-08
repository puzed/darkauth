import { pendingAuth } from "../db/schema.js";
import type { Context } from "../types.js";

export async function createPendingAuth(
  context: Context,
  data: {
    requestId: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    zkPubKid?: string;
    userSub?: string;
    origin: string;
    expiresAt: Date;
  }
) {
  await context.db.insert(pendingAuth).values({
    requestId: data.requestId,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    state: data.state,
    codeChallenge: data.codeChallenge,
    codeChallengeMethod: data.codeChallengeMethod,
    zkPubKid: data.zkPubKid,
    userSub: data.userSub,
    origin: data.origin,
    createdAt: new Date(),
    expiresAt: data.expiresAt,
  });
  return { requestId: data.requestId } as const;
}

export async function getPendingAuth(context: Context, requestId: string) {
  const { pendingAuth } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  return await context.db.query.pendingAuth.findFirst({
    where: eq(pendingAuth.requestId, requestId),
  });
}

export async function setPendingAuthUserSub(context: Context, requestId: string, sub: string) {
  const { pendingAuth } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  await context.db
    .update(pendingAuth)
    .set({ userSub: sub })
    .where(eq(pendingAuth.requestId, requestId));
}

export async function deletePendingAuth(context: Context, requestId: string) {
  const { pendingAuth } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  await context.db.delete(pendingAuth).where(eq(pendingAuth.requestId, requestId));
}
