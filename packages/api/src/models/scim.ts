import { and, asc, count, eq, gt, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  scimBearerTokens,
  scimGroupMembers,
  scimGroups,
  scimUsers,
  sessions,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { constantTimeCompare, generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { deleteAuthCodesForUser } from "./authCodes.ts";
import { deletePendingAuthForUser } from "./authorize.ts";
import { getStringSetting } from "./scimPolicy.ts";
import { createUser as createLocalUser } from "./users.ts";

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

function userFilterCondition(filter?: string | null) {
  const parsed = parseSimpleFilter(filter);
  if (!parsed) return undefined;
  if (parsed.attr === "id") return eq(scimUsers.userSub, parsed.value);
  if (parsed.attr === "userName") {
    return parsed.op === "co"
      ? ilike(scimUsers.userName, `%${parsed.value}%`)
      : eq(scimUsers.userName, parsed.value);
  }
  if (parsed.attr === "externalId") return eq(scimUsers.externalId, parsed.value);
  if (parsed.attr === "displayName") {
    return parsed.op === "co"
      ? ilike(scimUsers.displayName, `%${parsed.value}%`)
      : eq(scimUsers.displayName, parsed.value);
  }
  if (parsed.attr === "active") return eq(scimUsers.active, parsed.value.toLowerCase() === "true");
  throw new ValidationError("Unsupported SCIM filter");
}

function groupFilterCondition(filter?: string | null) {
  const parsed = parseSimpleFilter(filter);
  if (!parsed) return undefined;
  if (parsed.attr === "id") return eq(scimGroups.id, parsed.value);
  if (parsed.attr === "externalId") return eq(scimGroups.externalId, parsed.value);
  if (parsed.attr === "displayName") {
    return parsed.op === "co"
      ? ilike(scimGroups.displayName, `%${parsed.value}%`)
      : eq(scimGroups.displayName, parsed.value);
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

async function findScimUserRow(context: Context, userSub: string) {
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
    .where(eq(scimUsers.userSub, userSub));
  return row || null;
}

export async function createScimBearerToken(
  context: Context,
  input: { name: string; createdByAdminId?: string | null; expiresAt?: Date | null }
) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Token name is required");
  const token = `da_scim_${generateRandomString(32)}`;
  const tokenHash = sha256Base64Url(token);
  const tokenPrefix = token.slice(0, 16);
  const [row] = await context.db
    .insert(scimBearerTokens)
    .values({
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

export async function listScimBearerTokens(context: Context) {
  return await context.db
    .select({
      id: scimBearerTokens.id,
      name: scimBearerTokens.name,
      tokenPrefix: scimBearerTokens.tokenPrefix,
      createdByAdminId: scimBearerTokens.createdByAdminId,
      createdAt: scimBearerTokens.createdAt,
      lastUsedAt: scimBearerTokens.lastUsedAt,
      expiresAt: scimBearerTokens.expiresAt,
      revokedAt: scimBearerTokens.revokedAt,
    })
    .from(scimBearerTokens)
    .orderBy(asc(scimBearerTokens.createdAt));
}

export async function revokeScimBearerToken(context: Context, id: string) {
  const [row] = await context.db
    .update(scimBearerTokens)
    .set({ revokedAt: new Date() })
    .where(eq(scimBearerTokens.id, id))
    .returning();
  if (!row) throw new NotFoundError("SCIM token not found");
  return { success: true };
}

export async function requireScimBearerToken(context: Context, token: string | null | undefined) {
  if (!token) throw new UnauthorizedError("SCIM bearer token required");
  const tokenHash = sha256Base64Url(token);
  const now = new Date();
  const candidates = await context.db
    .select({
      id: scimBearerTokens.id,
      tokenHash: scimBearerTokens.tokenHash,
    })
    .from(scimBearerTokens)
    .where(
      and(
        isNull(scimBearerTokens.revokedAt),
        or(isNull(scimBearerTokens.expiresAt), gt(scimBearerTokens.expiresAt, now))
      )
    );
  const match = candidates.find((candidate) => constantTimeCompare(candidate.tokenHash, tokenHash));
  if (!match) throw new UnauthorizedError("Invalid SCIM bearer token");
  await context.db
    .update(scimBearerTokens)
    .set({ lastUsedAt: now })
    .where(eq(scimBearerTokens.id, match.id));
  return match;
}

export async function createScimUser(context: Context, input: ScimUserInput) {
  const userName = resolvedUserName(input);
  const email = resolvedEmail(input, userName);
  const displayName = resolvedDisplayName(input);
  const externalId =
    typeof input.externalId === "string" && input.externalId.trim()
      ? input.externalId.trim()
      : null;
  const existing = await context.db.query.scimUsers.findFirst({
    where: externalId
      ? or(eq(scimUsers.externalId, externalId), eq(scimUsers.userName, userName))
      : eq(scimUsers.userName, userName),
  });
  if (existing) throw new ConflictError("SCIM user already exists");
  const local = await createLocalUser(context, { email, name: displayName || userName });
  await context.db.insert(scimUsers).values({
    userSub: local.sub,
    externalId,
    userName,
    displayName,
    active: input.active !== false,
    raw: input as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (input.active === false) await revokeUserAuthorizationState(context, local.sub);
  const row = await findScimUserRow(context, local.sub);
  if (!row) throw new NotFoundError("SCIM user not found");
  return toScimUser(row);
}

export async function getScimUser(context: Context, userSub: string) {
  const row = await findScimUserRow(context, userSub);
  if (!row) throw new NotFoundError("SCIM user not found");
  return toScimUser(row);
}

export async function listScimUsers(
  context: Context,
  input: { startIndex?: number; count?: number; filter?: string | null }
) {
  const { startIndex, itemsPerPage, offset } = parsePage(input);
  const condition = userFilterCondition(input.filter);
  const totalRows = await (condition
    ? context.db.select({ count: count() }).from(scimUsers).where(condition)
    : context.db.select({ count: count() }).from(scimUsers));
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
  const rows = await (condition ? query.where(condition) : query)
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

export async function replaceScimUser(context: Context, userSub: string, input: ScimUserInput) {
  await getScimUser(context, userSub);
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
      .where(eq(scimUsers.userSub, userSub));
  });
  if (!active) return await deprovisionScimUser(context, userSub);
  return await getScimUser(context, userSub);
}

export async function patchScimUser(
  context: Context,
  userSub: string,
  operations: ScimPatchOperation[]
) {
  const current = await getScimUser(context, userSub);
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
  return await replaceScimUser(context, userSub, next);
}

export async function deactivateScimUser(context: Context, userSub: string) {
  return await deprovisionScimUser(context, userSub);
}

async function deprovisionScimUser(context: Context, userSub: string) {
  const current = await getScimUser(context, userSub);
  await context.db
    .update(scimUsers)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(scimUsers.userSub, userSub));
  await revokeUserAuthorizationState(context, userSub);
  const action = await getStringSetting(context, "users.scim.deprovision_action", "suspend");
  if (action === "delete") {
    await context.db.delete(users).where(eq(users.sub, userSub));
    return { ...current, active: false };
  }
  return await getScimUser(context, userSub);
}

async function revokeUserAuthorizationState(context: Context, userSub: string) {
  await context.db.delete(sessions).where(eq(sessions.userSub, userSub));
  await deleteAuthCodesForUser(context, userSub);
  await deletePendingAuthForUser(context, userSub);
}

async function groupMembers(context: Context, groupId: string) {
  return await context.db
    .select({
      value: scimGroupMembers.userSub,
      display: scimUsers.displayName,
      userName: scimUsers.userName,
    })
    .from(scimGroupMembers)
    .innerJoin(scimUsers, eq(scimUsers.userSub, scimGroupMembers.userSub))
    .where(eq(scimGroupMembers.groupId, groupId))
    .orderBy(asc(scimUsers.userName));
}

async function toScimGroup(context: Context, row: typeof scimGroups.$inferSelect) {
  const members = await groupMembers(context, row.id);
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

export async function createScimGroup(context: Context, input: ScimGroupInput) {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new ValidationError("displayName is required");
  const externalId =
    typeof input.externalId === "string" && input.externalId.trim()
      ? input.externalId.trim()
      : null;
  const existing = await context.db.query.scimGroups.findFirst({
    where: externalId
      ? or(eq(scimGroups.externalId, externalId), eq(scimGroups.displayName, displayName))
      : eq(scimGroups.displayName, displayName),
  });
  if (existing) throw new ConflictError("SCIM group already exists");
  const [row] = await context.db
    .insert(scimGroups)
    .values({ displayName, externalId, raw: input as Record<string, unknown> })
    .returning();
  if (!row) throw new ValidationError("Unable to create SCIM group");
  await replaceGroupMembers(context, row.id, input.members || []);
  return await toScimGroup(context, row);
}

export async function getScimGroup(context: Context, groupId: string) {
  const row = await context.db.query.scimGroups.findFirst({ where: eq(scimGroups.id, groupId) });
  if (!row) throw new NotFoundError("SCIM group not found");
  return await toScimGroup(context, row);
}

export async function listScimGroups(
  context: Context,
  input: { startIndex?: number; count?: number; filter?: string | null }
) {
  const { startIndex, itemsPerPage, offset } = parsePage(input);
  const condition = groupFilterCondition(input.filter);
  const totalRows = await (condition
    ? context.db.select({ count: count() }).from(scimGroups).where(condition)
    : context.db.select({ count: count() }).from(scimGroups));
  const rows = await (condition
    ? context.db.select().from(scimGroups).where(condition)
    : context.db.select().from(scimGroups)
  )
    .orderBy(asc(scimGroups.displayName))
    .limit(itemsPerPage)
    .offset(offset);
  const resources = [];
  for (const row of rows) resources.push(await toScimGroup(context, row));
  return listResponse(resources, Number(totalRows[0]?.count || 0), startIndex, rows.length);
}

async function assertScimUsersExist(context: Context, userSubs: string[]) {
  if (userSubs.length === 0) return;
  const rows = await context.db
    .select({ userSub: scimUsers.userSub })
    .from(scimUsers)
    .where(inArray(scimUsers.userSub, userSubs));
  if (rows.length !== new Set(userSubs).size)
    throw new ValidationError("One or more members not found");
}

async function replaceGroupMembers(
  context: Context,
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
  await assertScimUsersExist(context, userSubs);
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
  await syncScimGroupMapping(context, groupId);
}

export async function patchScimGroup(
  context: Context,
  groupId: string,
  operations: ScimPatchOperation[]
) {
  await getScimGroup(context, groupId);
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
      if (op === "replace") await replaceGroupMembers(context, groupId, members);
      else if (op === "add") {
        const userSubs = members
          .map((member) => (typeof member.value === "string" ? member.value.trim() : ""))
          .filter(Boolean);
        await assertScimUsersExist(context, userSubs);
        if (userSubs.length > 0) {
          await context.db
            .insert(scimGroupMembers)
            .values(userSubs.map((userSub) => ({ groupId, userSub })))
            .onConflictDoNothing();
        }
        await syncScimGroupMapping(context, groupId);
      } else if (op === "remove") {
        const userSubs = members
          .map((member) => (typeof member.value === "string" ? member.value.trim() : ""))
          .filter(Boolean);
        if (userSubs.length === 0) await replaceGroupMembers(context, groupId, []);
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
        await syncScimGroupMapping(context, groupId);
      } else throw new ValidationError("Unsupported PATCH op");
      await context.db
        .update(scimGroups)
        .set({ updatedAt: new Date() })
        .where(eq(scimGroups.id, groupId));
      continue;
    }
    throw new ValidationError("Unsupported PATCH path");
  }
  return await getScimGroup(context, groupId);
}

export async function deleteScimGroup(context: Context, groupId: string) {
  await getScimGroup(context, groupId);
  await removeScimGroupMappingRoles(context, groupId);
  await context.db.delete(scimGroups).where(eq(scimGroups.id, groupId));
  return { success: true };
}

async function syncScimGroupMapping(context: Context, groupId: string) {
  const group = await context.db.query.scimGroups.findFirst({ where: eq(scimGroups.id, groupId) });
  if (!group) throw new NotFoundError("SCIM group not found");
  const mapping = await resolveGroupMapping(context, group);
  if (!mapping) return;
  const organization = await resolveMappedOrganization(context, group, mapping);
  if (!organization) return;
  const roleIds = await resolveMappedRoleIds(context, mapping);
  const members = await context.db
    .select({ userSub: scimGroupMembers.userSub })
    .from(scimGroupMembers)
    .where(eq(scimGroupMembers.groupId, groupId));
  const memberSubs = members.map((member) => member.userSub);
  const memberships = await upsertMappedMemberships(context, organization.id, memberSubs);
  if (roleIds.length > 0) {
    await syncMappedRoles(context, organization.id, memberships, roleIds, memberSubs);
  }
}

async function removeScimGroupMappingRoles(context: Context, groupId: string) {
  const group = await context.db.query.scimGroups.findFirst({ where: eq(scimGroups.id, groupId) });
  if (!group) return;
  const mapping = await resolveGroupMapping(context, group);
  if (!mapping) return;
  const organization = await resolveMappedOrganization(context, group, mapping);
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
        inArray(organizationMemberRoles.roleId, roleIds)
      )
    );
}

async function resolveGroupMapping(
  context: Context,
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
    const organization = await ensureOrganizationForUnknownScimGroup(context, group);
    return { organization_id: organization.id };
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
  group: typeof scimGroups.$inferSelect,
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
  return await ensureOrganizationForUnknownScimGroup(context, group);
}

async function ensureOrganizationForUnknownScimGroup(
  context: Context,
  group: typeof scimGroups.$inferSelect
) {
  const slug = slugify(group.displayName);
  const [created] = await context.db
    .insert(organizations)
    .values({
      slug,
      name: group.displayName,
      forceOtp: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();
  if (created) return created;
  const existing = await context.db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (!existing) throw new ValidationError("Unable to create mapped organization");
  return existing;
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
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userSub],
        set: { status: "active", updatedAt: new Date() },
      });
  }
  return await context.db
    .select({ id: organizationMembers.id, userSub: organizationMembers.userSub })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
}

async function syncMappedRoles(
  context: Context,
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
          roleIds.map((roleId) => ({ organizationMemberId: membership.id, roleId }))
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
        inArray(organizationMemberRoles.roleId, roleIds)
      )
    );
  await context.db
    .update(organizationMembers)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        inArray(organizationMembers.id, staleMembershipIds)
      )
    );
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `scim-${generateRandomString(8).toLowerCase()}`;
}
