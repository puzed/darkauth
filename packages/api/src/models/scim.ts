import { and, asc, count, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  authCodes,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  pendingAuth,
  roles,
  scimBearerTokens,
  scimConnections,
  scimGroupMembers,
  scimGroups,
  scimUsers,
  sessions,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { constantTimeCompare, generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { getStringSetting } from "./scimPolicy.ts";

export type ScimConnectionContext = {
  id: string;
  tokenId: string;
  organizationId: string;
  deprovisionAction: string;
  deleteUserSafety: string;
};

type ScimUserInput = {
  externalId?: string | null;
  userName?: string | null;
  name?: {
    formatted?: string | null;
    givenName?: string | null;
    familyName?: string | null;
  } | null;
  displayName?: string | null;
  active?: boolean | null;
  emails?: Array<{ value?: string | null; primary?: boolean | null }> | null;
};

type ScimPatchOperation = {
  op?: string;
  path?: string;
  value?: unknown;
};

type ScimGroupInput = {
  externalId?: string | null;
  displayName?: string | null;
  members?: Array<{ value?: string | null }> | null;
};

type ScimGroupMapping = {
  scim_group_id?: string;
  scim_external_id?: string;
  scim_display_name?: string;
  group_id?: string;
  external_id?: string;
  display_name?: string;
  organization_id?: string;
  organization_slug?: string;
  role_keys?: string[];
};

function asIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function firstEmail(input: ScimUserInput): string | null {
  const emails = Array.isArray(input.emails) ? input.emails : [];
  const primary = emails.find((email) => email?.primary && typeof email.value === "string");
  const value = primary?.value || emails.find((email) => typeof email?.value === "string")?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolvedUserName(input: ScimUserInput): string {
  const userName = typeof input.userName === "string" ? input.userName.trim() : "";
  if (userName) return userName;
  const email = firstEmail(input);
  if (email) return email;
  throw new ValidationError("userName is required");
}

function resolvedEmail(input: ScimUserInput, userName: string): string {
  const email = firstEmail(input) || userName;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError("SCIM userName or primary email must be an email address");
  }
  return email;
}

function resolvedDisplayName(input: ScimUserInput): string | null {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (displayName) return displayName;
  const formatted = typeof input.name?.formatted === "string" ? input.name.formatted.trim() : "";
  if (formatted) return formatted;
  const parts = [input.name?.givenName, input.name?.familyName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(" ") : null;
}

function scimLocation(resourceType: "Users" | "Groups", id: string): string {
  return `/scim/v2/${resourceType}/${encodeURIComponent(id)}`;
}

function listResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
  itemsPerPage: number
) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

function parsePage(input: { startIndex?: number; count?: number }) {
  const startIndex = Math.max(1, input.startIndex || 1);
  const itemsPerPage = Math.min(100, Math.max(0, input.count ?? 100));
  return { startIndex, itemsPerPage, offset: startIndex - 1 };
}

function parseSimpleFilter(filter?: string | null) {
  if (!filter) return null;
  const match = filter
    .trim()
    .match(/^(id|userName|externalId|displayName|active)\s+(eq|co)\s+"?([^"]+)"?$/i);
  if (!match) throw new ValidationError("Unsupported SCIM filter");
  return {
    attr: match[1] as "id" | "userName" | "externalId" | "displayName" | "active",
    op: match[2]?.toLowerCase() as "eq" | "co",
    value: match[3] || "",
  };
}

function userFilterCondition(scim: ScimConnectionContext, filter?: string | null) {
  const parsed = parseSimpleFilter(filter);
  const scope = eq(scimUsers.connectionId, scim.id);
  if (!parsed) return scope;
  if (parsed.attr === "id") return and(scope, eq(scimUsers.userSub, parsed.value));
  if (parsed.attr === "userName") {
    const match =
      parsed.op === "co"
        ? ilike(scimUsers.userName, `%${parsed.value}%`)
        : eq(scimUsers.userName, parsed.value);
    return and(scope, match);
  }
  if (parsed.attr === "externalId") return and(scope, eq(scimUsers.externalId, parsed.value));
  if (parsed.attr === "displayName") {
    const match =
      parsed.op === "co"
        ? ilike(scimUsers.displayName, `%${parsed.value}%`)
        : eq(scimUsers.displayName, parsed.value);
    return and(scope, match);
  }
  if (parsed.attr === "active")
    return and(scope, eq(scimUsers.active, parsed.value.toLowerCase() === "true"));
  throw new ValidationError("Unsupported SCIM filter");
}

function groupFilterCondition(scim: ScimConnectionContext, filter?: string | null) {
  const parsed = parseSimpleFilter(filter);
  const scope = eq(scimGroups.connectionId, scim.id);
  if (!parsed) return scope;
  if (parsed.attr === "id") return and(scope, eq(scimGroups.id, parsed.value));
  if (parsed.attr === "externalId") return and(scope, eq(scimGroups.externalId, parsed.value));
  if (parsed.attr === "displayName") {
    const match =
      parsed.op === "co"
        ? ilike(scimGroups.displayName, `%${parsed.value}%`)
        : eq(scimGroups.displayName, parsed.value);
    return and(scope, match);
  }
  throw new ValidationError("Unsupported SCIM filter");
}

function toScimUser(row: {
  userSub: string;
  externalId: string | null;
  userName: string;
  displayName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
  name: string | null;
}) {
  const displayName = row.displayName || row.name || row.userName;
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.userSub,
    externalId: row.externalId || undefined,
    userName: row.userName,
    name: { formatted: displayName },
    displayName,
    active: row.active,
    emails: row.email ? [{ value: row.email, primary: true }] : [],
    meta: {
      resourceType: "User",
      created: asIso(row.createdAt),
      lastModified: asIso(row.updatedAt),
      location: scimLocation("Users", row.userSub),
    },
  };
}

async function findScimUserRow(context: Context, scim: ScimConnectionContext, userSub: string) {
  const [row] = await context.db
    .select({
      userSub: scimUsers.userSub,
      externalId: scimUsers.externalId,
      userName: scimUsers.userName,
      displayName: scimUsers.displayName,
      active: scimUsers.active,
      createdAt: scimUsers.createdAt,
      updatedAt: scimUsers.updatedAt,
      email: users.email,
      name: users.name,
    })
    .from(scimUsers)
    .innerJoin(users, eq(users.sub, scimUsers.userSub))
    .where(and(eq(scimUsers.connectionId, scim.id), eq(scimUsers.userSub, userSub)));
  return row || null;
}

export async function createScimBearerToken(
  context: Context,
  input: {
    name: string;
    organizationId: string;
    connectionId?: string | null;
    connectionName?: string | null;
    createdByAdminId?: string | null;
    expiresAt?: Date | null;
  }
) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Token name is required");
  const organizationId = input.organizationId.trim();
  const organization = await context.db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new ValidationError("Organization is required");
  const connection = input.connectionId
    ? await getScimConnectionForOrganization(context, input.connectionId, organizationId)
    : await createScimConnection(context, {
        organizationId,
        name: input.connectionName || name,
      });
  const token = `da_scim_${generateRandomString(32)}`;
  const tokenHash = sha256Base64Url(token);
  const tokenPrefix = token.slice(0, 16);
  const [row] = await context.db
    .insert(scimBearerTokens)
    .values({
      connectionId: connection.id,
      organizationId,
      name,
      tokenHash,
      tokenPrefix,
      createdByAdminId: input.createdByAdminId || null,
      expiresAt: input.expiresAt || null,
    })
    .returning();
  if (!row) throw new ValidationError("Unable to create SCIM token");
  return { ...row, token };
}

export async function createScimConnection(
  context: Context,
  input: { organizationId: string; name: string; deprovisionAction?: string | null }
) {
  const organizationId = input.organizationId.trim();
  const organization = await context.db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new ValidationError("Organization is required");
  const name = input.name.trim();
  if (!name) throw new ValidationError("Connection name is required");
  const [row] = await context.db
    .insert(scimConnections)
    .values({
      organizationId,
      name,
      deprovisionAction: input.deprovisionAction || "suspend_membership",
    })
    .returning();
  if (!row) throw new ValidationError("Unable to create SCIM connection");
  return row;
}

async function getScimConnectionForOrganization(
  context: Context,
  connectionId: string,
  organizationId: string
) {
  const connection = await context.db.query.scimConnections.findFirst({
    where: and(
      eq(scimConnections.id, connectionId),
      eq(scimConnections.organizationId, organizationId)
    ),
  });
  if (!connection) throw new ValidationError("SCIM connection not found");
  if (!connection.enabled) throw new ValidationError("SCIM connection is disabled");
  return connection;
}

export async function listScimConnectionsForOrganization(context: Context, organizationId: string) {
  return await context.db
    .select()
    .from(scimConnections)
    .where(eq(scimConnections.organizationId, organizationId))
    .orderBy(asc(scimConnections.createdAt));
}

export async function getScimConnectionForOrg(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  const connection = await context.db.query.scimConnections.findFirst({
    where: and(
      eq(scimConnections.id, connectionId),
      eq(scimConnections.organizationId, organizationId)
    ),
  });
  if (!connection) throw new NotFoundError("SCIM connection not found");
  return connection;
}

export async function updateScimConnectionForOrg(
  context: Context,
  organizationId: string,
  connectionId: string,
  updates: {
    name?: string;
    enabled?: boolean;
    deprovisionAction?: string;
    deleteUserSafety?: string;
  }
) {
  await getScimConnectionForOrg(context, organizationId, connectionId);
  const patch: Partial<typeof scimConnections.$inferInsert> = { updatedAt: new Date() };
  if (typeof updates.name === "string") {
    const name = updates.name.trim();
    if (!name) throw new ValidationError("Connection name is required");
    patch.name = name;
  }
  if (typeof updates.enabled === "boolean") patch.enabled = updates.enabled;
  if (typeof updates.deprovisionAction === "string")
    patch.deprovisionAction = updates.deprovisionAction;
  if (typeof updates.deleteUserSafety === "string")
    patch.deleteUserSafety = updates.deleteUserSafety;
  const [row] = await context.db
    .update(scimConnections)
    .set(patch)
    .where(
      and(eq(scimConnections.id, connectionId), eq(scimConnections.organizationId, organizationId))
    )
    .returning();
  if (!row) throw new NotFoundError("SCIM connection not found");
  return row;
}

export async function deleteScimConnectionForOrg(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  const [row] = await context.db
    .delete(scimConnections)
    .where(
      and(eq(scimConnections.id, connectionId), eq(scimConnections.organizationId, organizationId))
    )
    .returning();
  if (!row) throw new NotFoundError("SCIM connection not found");
  return { success: true as const };
}

export async function listScimBearerTokensForConnection(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  await getScimConnectionForOrg(context, organizationId, connectionId);
  return await context.db
    .select({
      id: scimBearerTokens.id,
      connectionId: scimBearerTokens.connectionId,
      organizationId: scimBearerTokens.organizationId,
      name: scimBearerTokens.name,
      tokenPrefix: scimBearerTokens.tokenPrefix,
      createdByAdminId: scimBearerTokens.createdByAdminId,
      createdAt: scimBearerTokens.createdAt,
      lastUsedAt: scimBearerTokens.lastUsedAt,
      expiresAt: scimBearerTokens.expiresAt,
      revokedAt: scimBearerTokens.revokedAt,
    })
    .from(scimBearerTokens)
    .where(
      and(
        eq(scimBearerTokens.organizationId, organizationId),
        eq(scimBearerTokens.connectionId, connectionId)
      )
    )
    .orderBy(asc(scimBearerTokens.createdAt));
}

export async function createScimBearerTokenForConnection(
  context: Context,
  organizationId: string,
  connectionId: string,
  input: { name?: string | null; expiresAt?: Date | null }
) {
  const connection = await getScimConnectionForOrg(context, organizationId, connectionId);
  const name = (input.name || connection.name).trim();
  if (!name) throw new ValidationError("Token name is required");
  const token = `da_scim_${generateRandomString(32)}`;
  const tokenHash = sha256Base64Url(token);
  const tokenPrefix = token.slice(0, 16);
  const [row] = await context.db
    .insert(scimBearerTokens)
    .values({
      connectionId: connection.id,
      organizationId,
      name,
      tokenHash,
      tokenPrefix,
      createdByAdminId: null,
      expiresAt: input.expiresAt || null,
    })
    .returning();
  if (!row) throw new ValidationError("Unable to create SCIM token");
  return { ...row, token };
}

export async function revokeScimBearerTokenForConnection(
  context: Context,
  organizationId: string,
  connectionId: string,
  tokenId: string
) {
  const [row] = await context.db
    .update(scimBearerTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(scimBearerTokens.id, tokenId),
        eq(scimBearerTokens.organizationId, organizationId),
        eq(scimBearerTokens.connectionId, connectionId)
      )
    )
    .returning();
  if (!row) throw new NotFoundError("SCIM token not found");
  return { success: true as const };
}

export async function listScimBearerTokens(context: Context, organizationId?: string) {
  const condition = organizationId
    ? eq(scimBearerTokens.organizationId, organizationId)
    : undefined;
  const query = context.db
    .select({
      id: scimBearerTokens.id,
      connectionId: scimBearerTokens.connectionId,
      organizationId: scimBearerTokens.organizationId,
      organizationSlug: organizations.slug,
      organizationName: organizations.name,
      name: scimBearerTokens.name,
      tokenPrefix: scimBearerTokens.tokenPrefix,
      createdByAdminId: scimBearerTokens.createdByAdminId,
      createdAt: scimBearerTokens.createdAt,
      lastUsedAt: scimBearerTokens.lastUsedAt,
      expiresAt: scimBearerTokens.expiresAt,
      revokedAt: scimBearerTokens.revokedAt,
    })
    .from(scimBearerTokens)
    .leftJoin(organizations, eq(organizations.id, scimBearerTokens.organizationId));
  return await (condition ? query.where(condition) : query).orderBy(
    asc(scimBearerTokens.createdAt)
  );
}

export async function revokeScimBearerToken(context: Context, id: string, organizationId?: string) {
  const condition = organizationId
    ? and(eq(scimBearerTokens.id, id), eq(scimBearerTokens.organizationId, organizationId))
    : eq(scimBearerTokens.id, id);
  const [row] = await context.db
    .update(scimBearerTokens)
    .set({ revokedAt: new Date() })
    .where(condition)
    .returning();
  if (!row) throw new NotFoundError("SCIM token not found");
  return { success: true };
}

export async function revokeScimBearerTokenForOrganization(
  context: Context,
  organizationId: string,
  id: string
) {
  return await revokeScimBearerToken(context, id, organizationId);
}

export async function requireScimBearerToken(context: Context, token: string | null | undefined) {
  if (!token) throw new UnauthorizedError("SCIM bearer token required");
  const tokenHash = sha256Base64Url(token);
  const now = new Date();
  const candidates = await context.db
    .select({
      id: scimBearerTokens.id,
      tokenHash: scimBearerTokens.tokenHash,
      connectionId: scimBearerTokens.connectionId,
      organizationId: scimBearerTokens.organizationId,
      deprovisionAction: scimConnections.deprovisionAction,
      deleteUserSafety: scimConnections.deleteUserSafety,
    })
    .from(scimBearerTokens)
    .innerJoin(scimConnections, eq(scimConnections.id, scimBearerTokens.connectionId))
    .where(
      and(
        eq(scimConnections.enabled, true),
        isNull(scimBearerTokens.revokedAt),
        or(isNull(scimBearerTokens.expiresAt), gt(scimBearerTokens.expiresAt, now))
      )
    );
  const match = candidates.find((candidate) => constantTimeCompare(candidate.tokenHash, tokenHash));
  if (!match || !match.connectionId || !match.organizationId)
    throw new UnauthorizedError("Invalid SCIM bearer token");
  await context.db
    .update(scimBearerTokens)
    .set({ lastUsedAt: now })
    .where(eq(scimBearerTokens.id, match.id));
  return {
    id: match.connectionId,
    tokenId: match.id,
    organizationId: match.organizationId,
    deprovisionAction: match.deprovisionAction,
    deleteUserSafety: match.deleteUserSafety,
  };
}

export async function createScimUser(
  context: Context,
  scim: ScimConnectionContext,
  input: ScimUserInput
) {
  const userName = resolvedUserName(input);
  const email = resolvedEmail(input, userName);
  const displayName = resolvedDisplayName(input);
  const externalId =
    typeof input.externalId === "string" && input.externalId.trim()
      ? input.externalId.trim()
      : null;
  const existing = await context.db.query.scimUsers.findFirst({
    where: externalId
      ? and(
          eq(scimUsers.connectionId, scim.id),
          or(eq(scimUsers.externalId, externalId), eq(scimUsers.userName, userName))
        )
      : and(eq(scimUsers.connectionId, scim.id), eq(scimUsers.userName, userName)),
  });
  if (existing) throw new ConflictError("SCIM user already exists");
  const local = await createScimRootUser(context, { email, name: displayName || userName });
  const membership = await provisionScimMembership(
    context,
    scim,
    local.sub,
    input.active !== false
  );
  await context.db.insert(scimUsers).values({
    userSub: local.sub,
    connectionId: scim.id,
    organizationId: scim.organizationId,
    organizationMemberId: membership?.id || null,
    externalId,
    userName,
    displayName,
    active: input.active !== false,
    raw: input as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (input.active === false)
    await revokeUserAuthorizationState(context, local.sub, scim.organizationId);
  const row = await findScimUserRow(context, scim, local.sub);
  if (!row) throw new NotFoundError("SCIM user not found");
  return toScimUser(row);
}

async function createScimRootUser(
  context: Context,
  data: { email: string; name?: string | null; sub?: string }
) {
  const sub = data.sub || generateRandomString(16);
  const existing = await context.db.query.users.findFirst({ where: eq(users.email, data.email) });
  if (existing) {
    await context.db
      .update(users)
      .set({ name: data.name || existing.name })
      .where(eq(users.sub, existing.sub));
    return { sub: existing.sub, email: data.email, name: data.name || existing.name };
  }
  await context.db.insert(users).values({
    sub,
    email: data.email,
    opaqueLoginIdentity: data.email,
    name: data.name || null,
    createdAt: new Date(),
  });
  return { sub, email: data.email, name: data.name || null };
}

export async function getScimUser(context: Context, scim: ScimConnectionContext, userSub: string) {
  const row = await findScimUserRow(context, scim, userSub);
  if (!row) throw new NotFoundError("SCIM user not found");
  return toScimUser(row);
}

export async function listScimUsers(
  context: Context,
  scim: ScimConnectionContext,
  input: { startIndex?: number; count?: number; filter?: string | null }
) {
  const { startIndex, itemsPerPage, offset } = parsePage(input);
  const condition = userFilterCondition(scim, input.filter);
  const totalRows = await context.db.select({ count: count() }).from(scimUsers).where(condition);
  const query = context.db
    .select({
      userSub: scimUsers.userSub,
      externalId: scimUsers.externalId,
      userName: scimUsers.userName,
      displayName: scimUsers.displayName,
      active: scimUsers.active,
      createdAt: scimUsers.createdAt,
      updatedAt: scimUsers.updatedAt,
      email: users.email,
      name: users.name,
    })
    .from(scimUsers)
    .innerJoin(users, eq(users.sub, scimUsers.userSub));
  const rows = await query
    .where(condition)
    .orderBy(asc(scimUsers.userName))
    .limit(itemsPerPage)
    .offset(offset);
  return listResponse(
    rows.map((row) => toScimUser(row)),
    Number(totalRows[0]?.count || 0),
    startIndex,
    rows.length
  );
}

export async function replaceScimUser(
  context: Context,
  scim: ScimConnectionContext,
  userSub: string,
  input: ScimUserInput
) {
  await getScimUser(context, scim, userSub);
  const userName = resolvedUserName(input);
  const email = resolvedEmail(input, userName);
  const displayName = resolvedDisplayName(input);
  const active = input.active !== false;
  const externalId =
    typeof input.externalId === "string" && input.externalId.trim()
      ? input.externalId.trim()
      : null;
  await context.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ email, name: displayName || userName })
      .where(eq(users.sub, userSub));
    await tx
      .update(scimUsers)
      .set({
        externalId,
        userName,
        displayName,
        active,
        raw: input as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(scimUsers.connectionId, scim.id), eq(scimUsers.userSub, userSub)));
  });
  if (active) {
    const membership = await provisionScimMembership(context, scim, userSub, true);
    await context.db
      .update(scimUsers)
      .set({ organizationMemberId: membership?.id || null, updatedAt: new Date() })
      .where(and(eq(scimUsers.connectionId, scim.id), eq(scimUsers.userSub, userSub)));
    return await getScimUser(context, scim, userSub);
  }
  return await deprovisionScimUser(context, scim, userSub);
}

export async function patchScimUser(
  context: Context,
  scim: ScimConnectionContext,
  userSub: string,
  operations: ScimPatchOperation[]
) {
  const current = await getScimUser(context, scim, userSub);
  const next: ScimUserInput = {
    userName: current.userName,
    externalId: current.externalId,
    displayName: current.displayName,
    active: current.active,
    emails: current.emails,
    name: current.name,
  };
  for (const operation of operations) {
    const op = (operation.op || "replace").toLowerCase();
    if (!["add", "replace", "remove"].includes(op))
      throw new ValidationError("Unsupported PATCH op");
    const path = operation.path?.toLowerCase();
    if (!path && typeof operation.value === "object" && operation.value) {
      Object.assign(next, operation.value as Record<string, unknown>);
      continue;
    }
    if (path === "active") next.active = op === "remove" ? false : Boolean(operation.value);
    else if (path === "displayname")
      next.displayName = op === "remove" ? null : String(operation.value ?? "");
    else if (path === "username")
      next.userName = op === "remove" ? null : String(operation.value ?? "");
    else if (path === "externalid")
      next.externalId = op === "remove" ? null : String(operation.value ?? "");
    else if (path === "emails")
      next.emails = op === "remove" ? [] : (operation.value as ScimUserInput["emails"]);
    else if (path === "name")
      next.name = op === "remove" ? null : (operation.value as ScimUserInput["name"]);
    else throw new ValidationError("Unsupported PATCH path");
  }
  return await replaceScimUser(context, scim, userSub, next);
}

export async function deactivateScimUser(
  context: Context,
  scim: ScimConnectionContext,
  userSub: string
) {
  return await deprovisionScimUser(context, scim, userSub);
}

async function deprovisionScimUser(context: Context, scim: ScimConnectionContext, userSub: string) {
  const current = await getScimUser(context, scim, userSub);
  await context.db
    .update(scimUsers)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(scimUsers.connectionId, scim.id), eq(scimUsers.userSub, userSub)));
  await applyScimDeprovisionMembershipPolicy(context, scim, userSub);
  await revokeUserAuthorizationState(context, userSub, scim.organizationId);
  if (scim.deprovisionAction === "delete_user" || scim.deprovisionAction === "delete") {
    const activeMemberships = await context.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active"))
      );
    if (activeMemberships.length > 0 || scim.deleteUserSafety === "fail_closed") {
      return await getScimUser(context, scim, userSub);
    }
    await context.db.delete(users).where(eq(users.sub, userSub));
    return { ...current, active: false };
  }
  return await getScimUser(context, scim, userSub);
}

async function revokeUserAuthorizationState(
  context: Context,
  userSub: string,
  organizationId: string
) {
  await context.db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userSub, userSub),
        sql`${sessions.data}->>'organizationId' = ${organizationId}`
      )
    );
  await context.db
    .delete(authCodes)
    .where(and(eq(authCodes.userSub, userSub), eq(authCodes.organizationId, organizationId)));
  await context.db
    .delete(pendingAuth)
    .where(and(eq(pendingAuth.userSub, userSub), eq(pendingAuth.organizationId, organizationId)));
}

async function provisionScimMembership(
  context: Context,
  scim: ScimConnectionContext,
  userSub: string,
  active: boolean
) {
  const [membership] = await context.db
    .insert(organizationMembers)
    .values({
      organizationId: scim.organizationId,
      userSub,
      status: active ? "active" : "suspended",
      scimConnectionId: scim.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [organizationMembers.organizationId, organizationMembers.userSub],
      set: {
        status: active ? "active" : "suspended",
        scimConnectionId: scim.id,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!membership) return null;
  if (active) await assignDefaultMemberRoles(context, scim, membership.id);
  return membership;
}

async function assignDefaultMemberRoles(
  context: Context,
  scim: ScimConnectionContext,
  organizationMemberId: string
) {
  const defaultRoles = await context.db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.defaultMember, true));
  const fallbackRoles =
    defaultRoles.length > 0
      ? defaultRoles
      : await context.db.select({ id: roles.id }).from(roles).where(eq(roles.key, "member"));
  if (fallbackRoles.length === 0) return;
  await context.db
    .insert(organizationMemberRoles)
    .values(
      fallbackRoles.map((role) => ({
        organizationMemberId,
        roleId: role.id,
        scimConnectionId: scim.id,
      }))
    )
    .onConflictDoNothing();
}

async function applyScimDeprovisionMembershipPolicy(
  context: Context,
  scim: ScimConnectionContext,
  userSub: string
) {
  const condition = and(
    eq(organizationMembers.organizationId, scim.organizationId),
    eq(organizationMembers.userSub, userSub),
    eq(organizationMembers.scimConnectionId, scim.id)
  );
  if (scim.deprovisionAction === "remove_membership") {
    await context.db.delete(organizationMembers).where(condition);
    return;
  }
  await context.db
    .update(organizationMembers)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(condition);
}

async function groupMembers(context: Context, groupId: string, connectionId: string | null) {
  return await context.db
    .select({
      value: scimGroupMembers.userSub,
      display: scimUsers.displayName,
      userName: scimUsers.userName,
    })
    .from(scimGroupMembers)
    .innerJoin(scimUsers, eq(scimUsers.userSub, scimGroupMembers.userSub))
    .where(
      connectionId
        ? and(eq(scimGroupMembers.groupId, groupId), eq(scimUsers.connectionId, connectionId))
        : eq(scimGroupMembers.groupId, groupId)
    )
    .orderBy(asc(scimUsers.userName));
}

async function toScimGroup(context: Context, row: typeof scimGroups.$inferSelect) {
  const members = await groupMembers(context, row.id, row.connectionId);
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: row.id,
    externalId: row.externalId || undefined,
    displayName: row.displayName,
    members: members.map((member) => ({
      value: member.value,
      display: member.display || member.userName,
      $ref: scimLocation("Users", member.value),
    })),
    meta: {
      resourceType: "Group",
      created: asIso(row.createdAt),
      lastModified: asIso(row.updatedAt),
      location: scimLocation("Groups", row.id),
    },
  };
}

export async function createScimGroup(
  context: Context,
  scim: ScimConnectionContext,
  input: ScimGroupInput
) {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new ValidationError("displayName is required");
  const externalId =
    typeof input.externalId === "string" && input.externalId.trim()
      ? input.externalId.trim()
      : null;
  const existing = await context.db.query.scimGroups.findFirst({
    where: externalId
      ? and(
          eq(scimGroups.connectionId, scim.id),
          or(eq(scimGroups.externalId, externalId), eq(scimGroups.displayName, displayName))
        )
      : and(eq(scimGroups.connectionId, scim.id), eq(scimGroups.displayName, displayName)),
  });
  if (existing) throw new ConflictError("SCIM group already exists");
  const [row] = await context.db
    .insert(scimGroups)
    .values({
      connectionId: scim.id,
      organizationId: scim.organizationId,
      displayName,
      externalId,
      raw: input as Record<string, unknown>,
    })
    .returning();
  if (!row) throw new ValidationError("Unable to create SCIM group");
  await replaceGroupMembers(context, scim, row.id, input.members || []);
  return await toScimGroup(context, row);
}

export async function getScimGroup(context: Context, scim: ScimConnectionContext, groupId: string) {
  const row = await context.db.query.scimGroups.findFirst({
    where: and(eq(scimGroups.connectionId, scim.id), eq(scimGroups.id, groupId)),
  });
  if (!row) throw new NotFoundError("SCIM group not found");
  return await toScimGroup(context, row);
}

export async function listScimGroups(
  context: Context,
  scim: ScimConnectionContext,
  input: { startIndex?: number; count?: number; filter?: string | null }
) {
  const { startIndex, itemsPerPage, offset } = parsePage(input);
  const condition = groupFilterCondition(scim, input.filter);
  const totalRows = await context.db.select({ count: count() }).from(scimGroups).where(condition);
  const rows = await context.db
    .select()
    .from(scimGroups)
    .where(condition)
    .orderBy(asc(scimGroups.displayName))
    .limit(itemsPerPage)
    .offset(offset);
  const resources = [];
  for (const row of rows) resources.push(await toScimGroup(context, row));
  return listResponse(resources, Number(totalRows[0]?.count || 0), startIndex, rows.length);
}

async function assertScimUsersExist(
  context: Context,
  scim: ScimConnectionContext,
  userSubs: string[]
) {
  if (userSubs.length === 0) return;
  const rows = await context.db
    .select({ userSub: scimUsers.userSub })
    .from(scimUsers)
    .where(and(eq(scimUsers.connectionId, scim.id), inArray(scimUsers.userSub, userSubs)));
  if (rows.length !== new Set(userSubs).size)
    throw new ValidationError("One or more members not found");
}

async function replaceGroupMembers(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string,
  members: Array<{ value?: string | null }>
) {
  const userSubs = Array.from(
    new Set(
      members
        .map((member) => (typeof member.value === "string" ? member.value.trim() : ""))
        .filter(Boolean)
    )
  );
  await assertScimUsersExist(context, scim, userSubs);
  await context.db.transaction(async (tx) => {
    await tx.delete(scimGroupMembers).where(eq(scimGroupMembers.groupId, groupId));
    if (userSubs.length > 0) {
      await tx
        .insert(scimGroupMembers)
        .values(userSubs.map((userSub) => ({ groupId, userSub })))
        .onConflictDoNothing();
    }
    await tx.update(scimGroups).set({ updatedAt: new Date() }).where(eq(scimGroups.id, groupId));
  });
  await syncScimGroupMapping(context, scim, groupId);
}

export async function patchScimGroup(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string,
  operations: ScimPatchOperation[]
) {
  await getScimGroup(context, scim, groupId);
  for (const operation of operations) {
    const op = (operation.op || "replace").toLowerCase();
    const path = operation.path?.toLowerCase();
    if (path === "displayname") {
      const displayName = String(operation.value || "").trim();
      if (!displayName) throw new ValidationError("displayName is required");
      await context.db
        .update(scimGroups)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(scimGroups.id, groupId));
      continue;
    }
    if (!path || path === "members") {
      const members = Array.isArray(operation.value)
        ? (operation.value as Array<{ value?: string | null }>)
        : [];
      if (op === "replace") await replaceGroupMembers(context, scim, groupId, members);
      else if (op === "add") {
        const userSubs = members
          .map((member) => (typeof member.value === "string" ? member.value.trim() : ""))
          .filter(Boolean);
        await assertScimUsersExist(context, scim, userSubs);
        if (userSubs.length > 0) {
          await context.db
            .insert(scimGroupMembers)
            .values(userSubs.map((userSub) => ({ groupId, userSub })))
            .onConflictDoNothing();
        }
        await syncScimGroupMapping(context, scim, groupId);
      } else if (op === "remove") {
        const userSubs = members
          .map((member) => (typeof member.value === "string" ? member.value.trim() : ""))
          .filter(Boolean);
        if (userSubs.length === 0) await replaceGroupMembers(context, scim, groupId, []);
        else {
          await context.db
            .delete(scimGroupMembers)
            .where(
              and(
                eq(scimGroupMembers.groupId, groupId),
                inArray(scimGroupMembers.userSub, userSubs)
              )
            );
        }
        await syncScimGroupMapping(context, scim, groupId);
      } else throw new ValidationError("Unsupported PATCH op");
      await context.db
        .update(scimGroups)
        .set({ updatedAt: new Date() })
        .where(eq(scimGroups.id, groupId));
      continue;
    }
    throw new ValidationError("Unsupported PATCH path");
  }
  return await getScimGroup(context, scim, groupId);
}

export async function deleteScimGroup(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string
) {
  await getScimGroup(context, scim, groupId);
  await removeScimGroupMappingRoles(context, scim, groupId);
  await context.db.delete(scimGroups).where(eq(scimGroups.id, groupId));
  return { success: true };
}

async function syncScimGroupMapping(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string
) {
  const group = await context.db.query.scimGroups.findFirst({
    where: and(eq(scimGroups.connectionId, scim.id), eq(scimGroups.id, groupId)),
  });
  if (!group) throw new NotFoundError("SCIM group not found");
  const mapping = await resolveGroupMapping(context, scim, group);
  if (!mapping) return;
  const organization = await resolveMappedOrganization(context, scim, mapping);
  if (!organization) return;
  if (organization.id !== scim.organizationId) {
    throw new ValidationError("SCIM group mapping organization must match connection organization");
  }
  const roleIds = await resolveMappedRoleIds(context, mapping);
  const members = await context.db
    .select({ userSub: scimGroupMembers.userSub })
    .from(scimGroupMembers)
    .where(eq(scimGroupMembers.groupId, groupId));
  const memberSubs = members.map((member) => member.userSub);
  const memberships = await upsertMappedMemberships(context, scim, organization.id, memberSubs);
  if (roleIds.length > 0) {
    await syncMappedRoles(
      context,
      scim,
      groupId,
      organization.id,
      memberships,
      roleIds,
      memberSubs
    );
  }
}

async function removeScimGroupMappingRoles(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string
) {
  const group = await context.db.query.scimGroups.findFirst({
    where: and(eq(scimGroups.connectionId, scim.id), eq(scimGroups.id, groupId)),
  });
  if (!group) return;
  const mapping = await resolveGroupMapping(context, scim, group);
  if (!mapping) return;
  const organization = await resolveMappedOrganization(context, scim, mapping);
  if (!organization) return;
  const roleIds = await resolveMappedRoleIds(context, mapping);
  if (roleIds.length === 0) return;
  const membershipRows = await context.db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organization.id));
  const membershipIds = membershipRows.map((row) => row.id);
  if (membershipIds.length === 0) return;
  await context.db
    .delete(organizationMemberRoles)
    .where(
      and(
        inArray(organizationMemberRoles.organizationMemberId, membershipIds),
        inArray(organizationMemberRoles.roleId, roleIds),
        eq(organizationMemberRoles.scimConnectionId, scim.id),
        eq(organizationMemberRoles.scimGroupId, groupId)
      )
    );
}

async function resolveGroupMapping(
  context: Context,
  scim: ScimConnectionContext,
  group: typeof scimGroups.$inferSelect
): Promise<ScimGroupMapping | null> {
  const setting = await context.db.query.settings.findFirst({
    where: (table, { eq }) => eq(table.key, "users.scim.group_role_mappings"),
  });
  const value =
    setting?.value && typeof setting.value === "object" && !Array.isArray(setting.value)
      ? (setting.value as Record<string, unknown>)
      : {};
  const mappings = Array.isArray(value.mappings) ? value.mappings : [];
  const mapping =
    mappings
      .map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as ScimGroupMapping)
          : null
      )
      .find((entry) => entry && mappingMatchesGroup(entry, group)) || null;
  if (mapping) return mapping;
  const policy = await getStringSetting(context, "users.scim.unknown_group_policy", "ignore");
  if (policy === "reject") throw new ValidationError("SCIM group has no mapping");
  if (policy === "create") {
    return { organization_id: scim.organizationId };
  }
  return null;
}

function mappingMatchesGroup(mapping: ScimGroupMapping, group: typeof scimGroups.$inferSelect) {
  const groupIds = [mapping.scim_group_id, mapping.group_id]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  const externalIds = [mapping.scim_external_id, mapping.external_id]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  const displayNames = [mapping.scim_display_name, mapping.display_name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  return (
    groupIds.includes(group.id) ||
    (group.externalId ? externalIds.includes(group.externalId) : false) ||
    displayNames.includes(group.displayName)
  );
}

async function resolveMappedOrganization(
  context: Context,
  scim: ScimConnectionContext,
  mapping: ScimGroupMapping
) {
  if (typeof mapping.organization_id === "string" && mapping.organization_id.trim()) {
    const organization = await context.db.query.organizations.findFirst({
      where: eq(organizations.id, mapping.organization_id.trim()),
    });
    if (!organization) throw new ValidationError("Mapped organization not found");
    return organization;
  }
  if (typeof mapping.organization_slug === "string" && mapping.organization_slug.trim()) {
    const organization = await context.db.query.organizations.findFirst({
      where: eq(organizations.slug, mapping.organization_slug.trim()),
    });
    if (!organization) throw new ValidationError("Mapped organization not found");
    return organization;
  }
  const organization = await context.db.query.organizations.findFirst({
    where: eq(organizations.id, scim.organizationId),
  });
  if (!organization) throw new ValidationError("Mapped organization not found");
  return organization;
}

async function resolveMappedRoleIds(context: Context, mapping: ScimGroupMapping) {
  const roleKeys = Array.isArray(mapping.role_keys)
    ? mapping.role_keys
        .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
        .map((key) => key.trim())
    : [];
  if (roleKeys.length === 0) return [];
  const uniqueRoleKeys = Array.from(new Set(roleKeys));
  const rows = await context.db
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.key, uniqueRoleKeys));
  if (rows.length !== uniqueRoleKeys.length) throw new ValidationError("Mapped role not found");
  return rows.map((row) => row.id);
}

async function upsertMappedMemberships(
  context: Context,
  scim: ScimConnectionContext,
  organizationId: string,
  userSubs: string[]
) {
  if (userSubs.length > 0) {
    await context.db
      .insert(organizationMembers)
      .values(
        userSubs.map((userSub) => ({
          organizationId,
          userSub,
          status: "active" as const,
          scimConnectionId: scim.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userSub],
        set: { status: "active", scimConnectionId: scim.id, updatedAt: new Date() },
      });
  }
  return await context.db
    .select({ id: organizationMembers.id, userSub: organizationMembers.userSub })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
}

async function syncMappedRoles(
  context: Context,
  scim: ScimConnectionContext,
  groupId: string,
  organizationId: string,
  memberships: Array<{ id: string; userSub: string }>,
  roleIds: string[],
  memberSubs: string[]
) {
  const memberSubSet = new Set(memberSubs);
  const activeMemberships = memberships.filter((membership) =>
    memberSubSet.has(membership.userSub)
  );
  if (activeMemberships.length > 0) {
    await context.db
      .insert(organizationMemberRoles)
      .values(
        activeMemberships.flatMap((membership) =>
          roleIds.map((roleId) => ({
            organizationMemberId: membership.id,
            roleId,
            scimConnectionId: scim.id,
            scimGroupId: groupId,
          }))
        )
      )
      .onConflictDoNothing();
  }
  const staleMembershipIds = memberships
    .filter((membership) => !memberSubSet.has(membership.userSub))
    .map((membership) => membership.id);
  if (staleMembershipIds.length === 0) return;
  await context.db
    .delete(organizationMemberRoles)
    .where(
      and(
        inArray(organizationMemberRoles.organizationMemberId, staleMembershipIds),
        inArray(organizationMemberRoles.roleId, roleIds),
        eq(organizationMemberRoles.scimConnectionId, scim.id),
        eq(organizationMemberRoles.scimGroupId, groupId)
      )
    );
  await context.db
    .update(organizationMembers)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        inArray(organizationMembers.id, staleMembershipIds),
        eq(organizationMembers.scimConnectionId, scim.id)
      )
    );
}
