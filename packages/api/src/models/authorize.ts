import { and, eq, isNull, or } from "drizzle-orm";
import { pendingAuth } from "../db/schema.ts";
import { ServerError } from "../errors.ts";
import type { Context } from "../types.ts";

export async function createPendingAuth(
  context: Context,
  data: {
    requestId: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
    nonce?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    zkPubKid?: string;
    keyDeliveryVersion?: string;
    deliveredKeyKind?: string;
    userSub?: string;
    organizationId?: string;
    origin: string;
    expiresAt: Date;
  }
) {
  try {
    await context.db.insert(pendingAuth).values({
      requestId: data.requestId,
      clientId: data.clientId,
      redirectUri: data.redirectUri,
      scope: data.scope,
      state: data.state,
      nonce: data.nonce,
      codeChallenge: data.codeChallenge,
      codeChallengeMethod: data.codeChallengeMethod,
      zkPubKid: data.zkPubKid,
      keyDeliveryVersion: data.keyDeliveryVersion ?? "v2",
      deliveredKeyKind: data.deliveredKeyKind ?? "client_app_key",
      userSub: data.userSub,
      organizationId: data.organizationId,
      origin: data.origin,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    if (isPendingAuthSchemaDrift(error)) {
      throw new ServerError("DarkAuth database schema is out of date; run migrations");
    }
    throw error;
  }
  return { requestId: data.requestId } as const;
}

function isPendingAuthSchemaDrift(error: unknown): boolean {
  for (let current: unknown = error; current; current = getErrorCause(current)) {
    const candidate = current as { code?: unknown; message?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (
      candidate.code === "42703" &&
      message.includes("scope") &&
      message.includes("pending_auth")
    ) {
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

export async function getPendingAuth(context: Context, requestId: string) {
  return await context.db.query.pendingAuth.findFirst({
    where: eq(pendingAuth.requestId, requestId),
  });
}

export async function deletePendingAuth(context: Context, requestId: string) {
  await context.db.delete(pendingAuth).where(eq(pendingAuth.requestId, requestId));
}

export async function deletePendingAuthForUser(context: Context, userSub: string) {
  await context.db.delete(pendingAuth).where(eq(pendingAuth.userSub, userSub));
}

export async function consumePendingAuth(context: Context, requestId: string, userSub: string) {
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
