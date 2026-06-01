import { and, count, eq, inArray } from "drizzle-orm";
import {
  organizationInvites,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  users,
} from "../db/schema.ts";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { getUserOrgAccess } from "./rbac.ts";

const personalSlugWords = [
  "amber",
  "blue",
  "bright",
  "clear",
  "green",
  "north",
  "silver",
  "swift",
  "star",
  "stone",
  "field",
  "harbor",
  "ridge",
  "signal",
  "spark",
  "vault",
  "wave",
  "willow",
];

type DbLike = Pick<Context["db"], "delete" | "insert" | "query" | "select" | "update">;

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function randomSlugPart() {
  const index = generateRandomString(2).charCodeAt(0) % personalSlugWords.length;
  return personalSlugWords[index] || "bright";
}

function randomSlugSuffix() {
  const suffix = generateRandomString(6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  return suffix || Date.now().toString(36).slice(-6);
}

export function personalOrganizationName(name?: string | null) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed ? `${trimmed}'s Personal` : "Personal Organization";
}

export function generatePersonalOrganizationSlug() {
  return `${randomSlugPart()}-${randomSlugPart()}-${randomSlugPart()}-${randomSlugSuffix()}`;
}

async function getDefaultRoleIds(db: DbLike, flag: "defaultMember" | "defaultCreator") {
  const column = flag === "defaultMember" ? roles.defaultMember : roles.defaultCreator;
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(column, true));
  if (rows.length === 0) {
    throw new ValidationError(
      flag === "defaultMember"
        ? "At least one default member role is required"
        : "At least one default creator role is required"
    );
  }
  return rows.map((role) => role.id);
}

async function assignRolesToMembership(db: DbLike, membershipId: string, roleIds: string[]) {
  const deduped = Array.from(new Set(roleIds));
  if (deduped.length === 0) return;
  await db
    .insert(organizationMemberRoles)
    .values(deduped.map((roleId) => ({ organizationMemberId: membershipId, roleId })))
    .onConflictDoNothing();
}

export async function createActiveMembershipWithDefaultRoles(
  db: DbLike,
  organizationId: string,
  userSub: string,
  includeCreatorRoles: boolean
) {
  const [membership] = await db
    .insert(organizationMembers)
    .values({
      organizationId,
      userSub,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  const activeMembership =
    membership ||
    (await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userSub, userSub)
      ),
    }));
  if (!activeMembership) throw new ValidationError("Failed to create organization membership");

  if (activeMembership.status !== "active") {
    const [updatedMembership] = await db
      .update(organizationMembers)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(organizationMembers.id, activeMembership.id))
      .returning();
    if (!updatedMembership) throw new ValidationError("Failed to create organization membership");
    await db
      .delete(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, updatedMembership.id));
    const roleIds = await getMembershipDefaultRoleIds(db, includeCreatorRoles);
    await assignRolesToMembership(db, updatedMembership.id, roleIds);
    return updatedMembership;
  }

  const roleIds = await getMembershipDefaultRoleIds(db, includeCreatorRoles);
  await assignRolesToMembership(db, activeMembership.id, roleIds);
  return activeMembership;
}

async function getMembershipDefaultRoleIds(db: DbLike, includeCreatorRoles: boolean) {
  const memberRoleIds = await getDefaultRoleIds(db, "defaultMember");
  if (!includeCreatorRoles) return memberRoleIds;
  const creatorRoleIds = await getDefaultRoleIds(db, "defaultCreator");
  return [...memberRoleIds, ...creatorRoleIds];
}

export async function createPersonalOrganizationForUser(
  db: DbLike,
  userSub: string,
  displayName?: string | null,
  options: { name?: string; slug?: string } = {}
) {
  const name = options.name?.trim() || personalOrganizationName(displayName);
  const requestedSlug = options.slug ? cleanSlug(options.slug) : undefined;
  if (requestedSlug !== undefined && !requestedSlug) {
    throw new ValidationError("Organization slug is required");
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug = requestedSlug || generatePersonalOrganizationSlug();
    const [created] = await db
      .insert(organizations)
      .values({
        slug,
        name,
        createdByUserSub: userSub,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      const membership = await createActiveMembershipWithDefaultRoles(
        db,
        created.id,
        userSub,
        true
      );
      return {
        organizationId: created.id,
        slug: created.slug,
        name: created.name,
        forceOtp: created.forceOtp,
        membershipId: membership.id,
        status: membership.status,
      };
    }

    if (requestedSlug) throw new ValidationError("Organization slug already exists");
  }

  throw new ValidationError("Failed to generate organization slug");
}

async function validateAssignableRoleIds(context: Context, roleIds: string[]) {
  const dedupedRoleIds = Array.from(new Set(roleIds));
  if (dedupedRoleIds.length === 0) return [];
  const existingRoles = await context.db
    .select({ id: roles.id })
    .from(roles)
    .where(and(inArray(roles.id, dedupedRoleIds), eq(roles.assignable, true)));
  if (existingRoles.length !== dedupedRoleIds.length) {
    throw new ValidationError("One or more roles were not found or cannot be assigned");
  }
  return dedupedRoleIds;
}

export async function listOrganizationsForUser(context: Context, userSub: string) {
  const rows = await context.db
    .select({
      organizationId: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      forceOtp: organizations.forceOtp,
      membershipId: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")));

  if (rows.length === 0) return [];

  const roleRows = await context.db
    .select({
      membershipId: organizationMemberRoles.organizationMemberId,
      id: roles.id,
      key: roles.key,
      name: roles.name,
    })
    .from(organizationMemberRoles)
    .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
    .where(
      inArray(
        organizationMemberRoles.organizationMemberId,
        rows.map((row) => row.membershipId)
      )
    );

  const rolesByMembership = new Map<string, Array<{ id: string; key: string; name: string }>>();
  for (const role of roleRows) {
    const roleList = rolesByMembership.get(role.membershipId) || [];
    roleList.push({ id: role.id, key: role.key, name: role.name });
    rolesByMembership.set(role.membershipId, roleList);
  }

  return rows.map((row) => ({
    ...row,
    roles: rolesByMembership.get(row.membershipId) || [],
  }));
}

export async function getOrganizationForUser(
  context: Context,
  userSub: string,
  organizationId: string
) {
  const row = await context.db
    .select({
      organizationId: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      forceOtp: organizations.forceOtp,
      membershipId: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userSub, userSub),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);

  return row[0] || null;
}

export async function requireOrganizationMembership(
  context: Context,
  userSub: string,
  organizationId: string
) {
  const org = await getOrganizationForUser(context, userSub, organizationId);
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export async function requireOrganizationManagePermission(
  context: Context,
  userSub: string,
  organizationId: string
) {
  const membership = await getOrganizationForUser(context, userSub, organizationId);
  if (!membership) throw new NotFoundError("Organization not found");
  const access = await getUserOrgAccess(context, userSub, organizationId);
  if (!access.permissions.includes("darkauth.org:manage")) {
    throw new NotFoundError("Organization not found");
  }
  return { membership, access };
}

export async function requireAnyOrganizationManagePermission(context: Context, userSub: string) {
  const organizations = await listOrganizationsForUser(context, userSub);
  for (const org of organizations) {
    const access = await getUserOrgAccess(context, userSub, org.organizationId);
    if (access.permissions.includes("darkauth.org:manage")) return;
  }
  throw new ForbiddenError("Missing required permission: darkauth.org:manage");
}

export async function createOrganization(
  context: Context,
  userSub: string,
  data: { name: string; slug?: string; forceOtp?: boolean }
) {
  const name = data.name.trim();
  if (!name) throw new ValidationError("Organization name is required");
  const requestedSlug = data.slug ? cleanSlug(data.slug) : undefined;
  if (data.slug !== undefined && !requestedSlug)
    throw new ValidationError("Organization slug is required");

  return context.db.transaction(async (trx) => {
    let created: typeof organizations.$inferSelect | undefined;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const slug = requestedSlug || generatePersonalOrganizationSlug();
      const [row] = await trx
        .insert(organizations)
        .values({
          slug,
          name,
          forceOtp: data.forceOtp === true,
          createdByUserSub: userSub,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        created = row;
        break;
      }
      if (requestedSlug) throw new ValidationError("Organization slug already exists");
    }

    if (!created) throw new ValidationError("Failed to generate organization slug");

    const membership = await createActiveMembershipWithDefaultRoles(trx, created.id, userSub, true);

    return {
      organizationId: created.id,
      slug: created.slug,
      name: created.name,
      forceOtp: created.forceOtp,
      membershipId: membership.id,
      status: membership.status,
    };
  });
}

export async function listAssignableRoles(
  context: Context,
  userSub: string,
  organizationId: string
) {
  await requireOrganizationManagePermission(context, userSub, organizationId);
  return context.db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
    })
    .from(roles)
    .where(eq(roles.assignable, true));
}

export async function listOrganizationMembers(
  context: Context,
  userSub: string,
  organizationId: string
) {
  await requireOrganizationMembership(context, userSub, organizationId);
  const access = await getUserOrgAccess(context, userSub, organizationId);
  const canManage = access.permissions.includes("darkauth.org:manage");

  const members = await context.db
    .select({
      membershipId: organizationMembers.id,
      userSub: organizationMembers.userSub,
      status: organizationMembers.status,
      email: users.email,
      name: users.name,
    })
    .from(organizationMembers)
    .leftJoin(users, eq(organizationMembers.userSub, users.sub))
    .where(eq(organizationMembers.organizationId, organizationId));

  const membershipIds = members.map((member) => member.membershipId);
  const roleRows =
    membershipIds.length === 0
      ? []
      : await context.db
          .select({
            membershipId: organizationMemberRoles.organizationMemberId,
            roleId: roles.id,
            roleKey: roles.key,
            roleName: roles.name,
          })
          .from(organizationMemberRoles)
          .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
          .where(inArray(organizationMemberRoles.organizationMemberId, membershipIds));

  const rolesByMembership = new Map<string, Array<{ id: string; key: string; name: string }>>();

  for (const row of roleRows) {
    const list = rolesByMembership.get(row.membershipId) || [];
    list.push({ id: row.roleId, key: row.roleKey, name: row.roleName });
    rolesByMembership.set(row.membershipId, list);
  }

  return members.map((member) => ({
    ...member,
    email: canManage ? member.email : null,
    name: canManage ? member.name : null,
    roles: rolesByMembership.get(member.membershipId) || [],
  }));
}

export async function createOrganizationInvite(
  context: Context,
  userSub: string,
  organizationId: string,
  data: { email: string; roleIds?: string[]; expiresAt?: Date }
) {
  await requireOrganizationManagePermission(context, userSub, organizationId);
  const validatedRoleIds = await validateAssignableRoleIds(context, data.roleIds || []);

  const email = data.email.trim().toLowerCase();
  const token = generateRandomString(48);
  const tokenHash = sha256Base64Url(token);
  const expiresAt = data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await context.db
    .insert(organizationInvites)
    .values({
      organizationId,
      email,
      roleIds: validatedRoleIds,
      tokenHash,
      expiresAt,
      createdByUserSub: userSub,
      createdAt: new Date(),
    })
    .returning();

  return {
    ...invite,
    token,
  };
}

export async function assignMemberRoles(
  context: Context,
  userSub: string,
  organizationId: string,
  memberId: string,
  roleIds: string[]
) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    throw new ValidationError("At least one role id is required");
  }

  await requireOrganizationManagePermission(context, userSub, organizationId);

  const member = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId)
    ),
  });

  if (!member) throw new NotFoundError("Organization member not found");

  const validatedRoleIds = await validateAssignableRoleIds(context, roleIds);
  const existingRoles = await context.db
    .select({ id: roles.id, key: roles.key, name: roles.name })
    .from(roles)
    .where(inArray(roles.id, validatedRoleIds));

  await context.db
    .insert(organizationMemberRoles)
    .values(validatedRoleIds.map((roleId) => ({ organizationMemberId: memberId, roleId })))
    .onConflictDoNothing();

  return existingRoles;
}

export async function removeMemberRole(
  context: Context,
  userSub: string,
  organizationId: string,
  memberId: string,
  roleId: string
) {
  await requireOrganizationManagePermission(context, userSub, organizationId);

  const member = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId)
    ),
  });
  if (!member) throw new NotFoundError("Organization member not found");

  await context.db
    .delete(organizationMemberRoles)
    .where(
      and(
        eq(organizationMemberRoles.organizationMemberId, memberId),
        eq(organizationMemberRoles.roleId, roleId)
      )
    );

  return { success: true as const };
}

async function activeOrganizationCountForUser(context: Context, userSub: string) {
  const rows = await context.db
    .select({ count: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")));
  return Number(rows[0]?.count || 0);
}

async function activeMembersForOrganization(context: Context, organizationId: string) {
  return context.db
    .select({ membershipId: organizationMembers.id, userSub: organizationMembers.userSub })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active")
      )
    );
}

async function userHasOrganizationManagePermission(
  context: Context,
  userSub: string,
  organizationId: string
) {
  const access = await getUserOrgAccess(context, userSub, organizationId);
  return access.permissions.includes("darkauth.org:manage");
}

async function assertRemovalKeepsOrganizationManageAuthority(
  context: Context,
  organizationId: string,
  removedMemberId: string
) {
  const members = await activeMembersForOrganization(context, organizationId);
  for (const member of members) {
    if (member.membershipId === removedMemberId) continue;
    if (await userHasOrganizationManagePermission(context, member.userSub, organizationId)) return;
  }
  throw new ValidationError("Organization must retain at least one managing member");
}

async function assertMemberCanBeRemoved(
  context: Context,
  organizationId: string,
  member: { id: string; userSub: string }
) {
  const memberships = await activeOrganizationCountForUser(context, member.userSub);
  if (memberships <= 1) {
    throw new ValidationError("User must belong to at least one active organization");
  }
  if (await userHasOrganizationManagePermission(context, member.userSub, organizationId)) {
    await assertRemovalKeepsOrganizationManageAuthority(context, organizationId, member.id);
  }
}

export async function removeOrganizationMember(
  context: Context,
  userSub: string,
  organizationId: string,
  memberId: string
) {
  await requireOrganizationManagePermission(context, userSub, organizationId);
  const member = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.status, "active")
    ),
  });
  if (!member) throw new NotFoundError("Organization member not found");
  await assertMemberCanBeRemoved(context, organizationId, member);
  await context.db.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
  return { success: true as const };
}

export async function leaveOrganization(context: Context, userSub: string, organizationId: string) {
  const membership = await getOrganizationForUser(context, userSub, organizationId);
  if (!membership) throw new NotFoundError("Organization not found");
  await assertMemberCanBeRemoved(context, organizationId, {
    id: membership.membershipId,
    userSub,
  });
  await context.db
    .delete(organizationMembers)
    .where(eq(organizationMembers.id, membership.membershipId));
  return { success: true as const };
}

export async function deleteOrganization(
  context: Context,
  userSub: string,
  organizationId: string
) {
  await requireOrganizationManagePermission(context, userSub, organizationId);
  const members = await activeMembersForOrganization(context, organizationId);
  for (const member of members) {
    const memberships = await activeOrganizationCountForUser(context, member.userSub);
    if (memberships <= 1) {
      throw new ValidationError("Deleting organization would leave a user without an organization");
    }
  }
  const [deleted] = await context.db
    .delete(organizations)
    .where(eq(organizations.id, organizationId))
    .returning();
  if (!deleted) throw new NotFoundError("Organization not found");
  return { success: true as const };
}
