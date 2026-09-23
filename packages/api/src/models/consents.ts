import { and, desc, eq } from "drizzle-orm";
import { clients, userClientConsents } from "../db/schema.ts";
import { deleteUserClientSessions } from "../services/sessions.ts";
import type { Context } from "../types.ts";

export function parseScopes(scope: string | null | undefined): string[] {
  return Array.from(new Set((scope ?? "").split(/\s+/).filter(Boolean)));
}

export async function getUserClientConsent(context: Context, userSub: string, clientId: string) {
  return (
    (await context.db.query.userClientConsents.findFirst({
      where: and(
        eq(userClientConsents.userSub, userSub),
        eq(userClientConsents.clientId, clientId)
      ),
    })) ?? null
  );
}

export async function recordUserClientConsent(
  context: Context,
  data: { userSub: string; clientId: string; scope: string; organizationId: string | null }
) {
  const existing = await getUserClientConsent(context, data.userSub, data.clientId);
  const sameOrganization = (existing?.organizationId ?? null) === data.organizationId;
  const scopes = parseScopes(
    sameOrganization ? `${existing?.scopes ?? ""} ${data.scope}` : data.scope
  ).join(" ");
  const now = new Date();
  await context.db
    .insert(userClientConsents)
    .values({
      userSub: data.userSub,
      clientId: data.clientId,
      scopes,
      organizationId: data.organizationId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userClientConsents.userSub, userClientConsents.clientId],
      set: { scopes, organizationId: data.organizationId, updatedAt: now },
    });
}

export async function listUserClientConsents(context: Context, userSub: string) {
  const rows = await context.db
    .select({
      clientId: userClientConsents.clientId,
      clientName: clients.name,
      scopes: userClientConsents.scopes,
      organizationId: userClientConsents.organizationId,
      updatedAt: userClientConsents.updatedAt,
    })
    .from(userClientConsents)
    .innerJoin(clients, eq(userClientConsents.clientId, clients.clientId))
    .where(eq(userClientConsents.userSub, userSub))
    .orderBy(desc(userClientConsents.updatedAt));
  return rows.map((row) => ({
    client_id: row.clientId,
    client_name: row.clientName,
    scopes: parseScopes(row.scopes),
    organization_id: row.organizationId,
    updated_at: row.updatedAt.toISOString(),
  }));
}

export async function revokeUserClientConsent(context: Context, userSub: string, clientId: string) {
  await context.db
    .delete(userClientConsents)
    .where(and(eq(userClientConsents.userSub, userSub), eq(userClientConsents.clientId, clientId)));
  await deleteUserClientSessions(context, userSub, clientId);
}
