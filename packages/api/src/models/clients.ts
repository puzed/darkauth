import { asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { clients } from "../db/schema.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function deleteClient(context: Context, clientId: string) {
  if (!clientId) throw new ValidationError("Client ID is required");
  const existing = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
  });
  if (!existing) throw new NotFoundError("Client not found");
  await context.db.delete(clients).where(eq(clients.clientId, clientId));
  return { success: true } as const;
}

export async function listClients(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: "createdAt" | "updatedAt" | "clientId" | "name" | "type";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn =
    sortBy === "updatedAt"
      ? clients.updatedAt
      : sortBy === "clientId"
        ? clients.clientId
        : sortBy === "name"
          ? clients.name
          : sortBy === "type"
            ? clients.type
            : clients.createdAt;
  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const searchCondition = searchTerm
    ? or(ilike(clients.clientId, searchTerm), ilike(clients.name, searchTerm))
    : undefined;

  const totalRows = await (searchCondition
    ? context.db.select({ count: count() }).from(clients).where(searchCondition)
    : context.db.select({ count: count() }).from(clients));
  const total = totalRows[0]?.count || 0;

  const rows = await (searchCondition
    ? context.db
        .select({
          clientId: clients.clientId,
          name: clients.name,
          showOnUserDashboard: clients.showOnUserDashboard,
          dashboardPosition: clients.dashboardPosition,
          appUrl: clients.appUrl,
          dashboardIconMode: clients.dashboardIconMode,
          dashboardIconEmoji: clients.dashboardIconEmoji,
          dashboardIconLetter: clients.dashboardIconLetter,
          type: clients.type,
          tokenEndpointAuthMethod: clients.tokenEndpointAuthMethod,
          requirePkce: clients.requirePkce,
          zkDelivery: clients.zkDelivery,
          zkRequired: clients.zkRequired,
          allowedJweAlgs: clients.allowedJweAlgs,
          allowedJweEncs: clients.allowedJweEncs,
          redirectUris: clients.redirectUris,
          postLogoutRedirectUris: clients.postLogoutRedirectUris,
          grantTypes: clients.grantTypes,
          responseTypes: clients.responseTypes,
          scopes: clients.scopes,
          allowedZkOrigins: clients.allowedZkOrigins,
          idTokenLifetimeSeconds: clients.idTokenLifetimeSeconds,
          refreshTokenLifetimeSeconds: clients.refreshTokenLifetimeSeconds,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        })
        .from(clients)
        .where(searchCondition)
    : context.db
        .select({
          clientId: clients.clientId,
          name: clients.name,
          showOnUserDashboard: clients.showOnUserDashboard,
          dashboardPosition: clients.dashboardPosition,
          appUrl: clients.appUrl,
          dashboardIconMode: clients.dashboardIconMode,
          dashboardIconEmoji: clients.dashboardIconEmoji,
          dashboardIconLetter: clients.dashboardIconLetter,
          type: clients.type,
          tokenEndpointAuthMethod: clients.tokenEndpointAuthMethod,
          requirePkce: clients.requirePkce,
          zkDelivery: clients.zkDelivery,
          zkRequired: clients.zkRequired,
          allowedJweAlgs: clients.allowedJweAlgs,
          allowedJweEncs: clients.allowedJweEncs,
          redirectUris: clients.redirectUris,
          postLogoutRedirectUris: clients.postLogoutRedirectUris,
          grantTypes: clients.grantTypes,
          responseTypes: clients.responseTypes,
          scopes: clients.scopes,
          allowedZkOrigins: clients.allowedZkOrigins,
          idTokenLifetimeSeconds: clients.idTokenLifetimeSeconds,
          refreshTokenLifetimeSeconds: clients.refreshTokenLifetimeSeconds,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        })
        .from(clients)
  )
    .orderBy(sortFn(sortColumn), sortFn(clients.clientId))
    .limit(limit)
    .offset(offset);

  const totalPages = Math.ceil(total / limit);
  return {
    clients: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function createClient(
  context: Context,
  data: {
    clientId: string;
    name: string;
    type: "public" | "confidential";
    tokenEndpointAuthMethod?: "none" | "client_secret_basic";
    showOnUserDashboard?: boolean;
    dashboardPosition?: number;
    appUrl?: string;
    dashboardIconMode?: "letter" | "emoji" | "upload";
    dashboardIconEmoji?: string | null;
    dashboardIconLetter?: string | null;
    dashboardIconMimeType?: string | null;
    dashboardIconData?: Buffer | null;
    requirePkce?: boolean;
    zkDelivery?: "none" | "fragment-jwe";
    zkRequired?: boolean;
    allowedJweAlgs?: string[];
    allowedJweEncs?: string[];
    redirectUris?: string[];
    postLogoutRedirectUris?: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    scopes?: string[];
    allowedZkOrigins?: string[];
    idTokenLifetimeSeconds?: number | null;
    refreshTokenLifetimeSeconds?: number | null;
  }
) {
  let clientSecret: string | null = null;
  let clientSecretEnc: Buffer | null = null;
  const tokenEndpointAuthMethod =
    data.type === "public" ? "none" : (data.tokenEndpointAuthMethod ?? "none");
  if (data.type === "confidential" || tokenEndpointAuthMethod === "client_secret_basic") {
    clientSecret = (await import("node:crypto")).randomBytes(32).toString("base64url");
    if (context.services.kek?.isAvailable()) {
      clientSecretEnc = await context.services.kek.encrypt(Buffer.from(clientSecret));
    } else {
      clientSecretEnc = null;
    }
  }
  const row = {
    clientId: data.clientId,
    name: data.name,
    type: data.type,
    tokenEndpointAuthMethod,
    showOnUserDashboard: data.showOnUserDashboard ?? false,
    dashboardPosition: data.dashboardPosition ?? 0,
    appUrl: data.appUrl ?? null,
    dashboardIconMode: data.dashboardIconMode ?? "letter",
    dashboardIconEmoji: data.dashboardIconEmoji ?? null,
    dashboardIconLetter: data.dashboardIconLetter ?? null,
    dashboardIconMimeType: data.dashboardIconMimeType ?? null,
    dashboardIconData: data.dashboardIconData ?? null,
    clientSecretEnc,
    requirePkce: data.requirePkce ?? true,
    zkDelivery: data.zkDelivery ?? "none",
    zkRequired: data.zkRequired ?? false,
    allowedJweAlgs: data.allowedJweAlgs ?? [],
    allowedJweEncs: data.allowedJweEncs ?? [],
    redirectUris: data.redirectUris ?? [],
    postLogoutRedirectUris: data.postLogoutRedirectUris ?? [],
    grantTypes: data.grantTypes ?? ["authorization_code"],
    responseTypes: data.responseTypes ?? ["code"],
    scopes: data.scopes ?? ["openid", "profile"],
    allowedZkOrigins: data.allowedZkOrigins ?? [],
    idTokenLifetimeSeconds: data.idTokenLifetimeSeconds ?? null,
    refreshTokenLifetimeSeconds: data.refreshTokenLifetimeSeconds ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies typeof clients.$inferInsert;
  await context.db.insert(clients).values(row);
  return { ...row, clientSecret: clientSecret ?? undefined };
}

export async function updateClient(
  context: Context,
  clientId: string,
  updates: Partial<typeof clients.$inferInsert>
) {
  const existing = await getClient(context, clientId);
  if (!existing) {
    throw new NotFoundError("Client not found");
  }

  const nextType = updates.type ?? existing.type;
  const nextAuthMethod =
    nextType === "public"
      ? "none"
      : (updates.tokenEndpointAuthMethod ?? existing.tokenEndpointAuthMethod);
  const needsSecret = nextType === "confidential" || nextAuthMethod === "client_secret_basic";

  const patch: Partial<typeof clients.$inferInsert> = {
    ...updates,
    tokenEndpointAuthMethod: nextAuthMethod,
  };

  if (needsSecret) {
    if (!existing.clientSecretEnc) {
      const generatedSecret = (await import("node:crypto")).randomBytes(32).toString("base64url");
      if (context.services.kek?.isAvailable()) {
        patch.clientSecretEnc = await context.services.kek.encrypt(Buffer.from(generatedSecret));
      } else {
        patch.clientSecretEnc = null;
      }
    }
  } else {
    // Public/none clients should not retain a server-side secret.
    patch.clientSecretEnc = null;
  }

  await context.db
    .update(clients)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(clients.clientId, clientId));
  return { success: true } as const;
}

export async function getClient(context: Context, clientId: string) {
  const row = await context.db.query.clients.findFirst({ where: eq(clients.clientId, clientId) });
  return row;
}

export async function getClientSecret(context: Context, clientId: string) {
  const client = await getClient(context, clientId);
  if (!client) {
    throw new NotFoundError("Client not found");
  }

  if (!client.clientSecretEnc) {
    return null;
  }

  if (!context.services.kek?.isAvailable()) {
    return null;
  }

  const decrypted = await context.services.kek.decrypt(client.clientSecretEnc);
  return decrypted.toString("utf-8");
}

export async function listVisibleApps(context: Context) {
  const rows = await context.db
    .select({
      id: clients.clientId,
      name: clients.name,
      description: clients.description,
      url: clients.appUrl,
      logoUrl: clients.logoUrl,
      dashboardPosition: clients.dashboardPosition,
      dashboardIconMode: clients.dashboardIconMode,
      dashboardIconEmoji: clients.dashboardIconEmoji,
      dashboardIconLetter: clients.dashboardIconLetter,
      dashboardIconMimeType: clients.dashboardIconMimeType,
    })
    .from(clients)
    .where(eq(clients.showOnUserDashboard, true))
    .orderBy(asc(clients.dashboardPosition), asc(clients.name), asc(clients.clientId));
  return rows.map((app) => ({
    id: app.id,
    name: app.name,
    description: app.description || undefined,
    url: app.url || undefined,
    logoUrl: app.logoUrl || undefined,
    iconMode: app.dashboardIconMode,
    iconEmoji: app.dashboardIconEmoji || undefined,
    iconLetter: app.dashboardIconLetter || undefined,
    iconUrl:
      app.dashboardIconMode === "upload" && app.dashboardIconMimeType
        ? `/api/client-icons/${encodeURIComponent(app.id)}`
        : undefined,
  }));
}

export async function getClientDashboardIcon(context: Context, clientId: string) {
  const row = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
    columns: {
      dashboardIconMode: true,
      dashboardIconData: true,
      dashboardIconMimeType: true,
    },
  });
  if (!row) return null;
  return row;
}
