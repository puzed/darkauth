import { pendingAuth } from "../db/schema.js";
import type { Context } from "../types.js";

export async function createPendingAuth(
  context: Context,
  data: {
    requestId: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    nonce?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    zkPubKid?: string;
    userSub?: string;
    organizationId?: string;
    origin: string;
    expiresAt: Date;
  }
) {
  await context.db.insert(pendingAuth).values({
    requestId: data.requestId,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    state: data.state,
    nonce: data.nonce,
    codeChallenge: data.codeChallenge,
    codeChallengeMethod: data.codeChallengeMethod,
    zkPubKid: data.zkPubKid,
    userSub: data.userSub,
    organizationId: data.organizationId,
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

export async function deletePendingAuth(context: Context, requestId: string) {
  const { pendingAuth } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  await context.db.delete(pendingAuth).where(eq(pendingAuth.requestId, requestId));
}

export async function consumePendingAuth(context: Context, requestId: string, userSub: string) {
  const { pendingAuth } = await import("../db/schema.js");
  const { and, eq, isNull, or } = await import("drizzle-orm");
  const [row] = await context.db
    .delete(pendingAuth)
    .where(
      and(
        eq(pendingAuth.requestId, requestId),
        or(isNull(pendingAuth.userSub), eq(pendingAuth.userSub, userSub))
      )
    )
    .returning();
  return row ?? null;
}
