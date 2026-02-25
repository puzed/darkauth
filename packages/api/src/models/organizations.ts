import { and, eq, inArray } from "drizzle-orm";
import {
  organizationInvites,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  users,
} from "../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.js";
import { getUserOrgAccess } from "./rbac.js";

async function validateAssignableRoleIds(context: Context, roleIds: string[]) {
  const dedupedRoleIds = Array.from(new Set(roleIds));
  if (dedupedRoleIds.length === 0) return [];
  const existingRoles = await context.db
    .select({ id: roles.id })
    .from(roles)
    .where(and(inArray(roles.id, dedupedRoleIds), eq(roles.system, true)));
  if (existingRoles.length !== dedupedRoleIds.length) {
    throw new ValidationError("One or more roles were not found or cannot be assigned");
  }
  return dedupedRoleIds;
}

export async function listOrganizationsForUser(context: Context, userSub: string) {
  return context.db
    .select({
      organizationId: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      membershipId: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")));
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
  data: { name: string; slug?: string }
) {
  const name = data.name.trim();
  if (!name) throw new ValidationError("Organization name is required");
  const slug = (data.slug || name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new ValidationError("Organization slug is required");

  return context.db.transaction(async (trx) => {
    const [created] = await trx
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

    if (!created) {
      throw new ValidationError("Organization slug already exists");
    }

    const [membership] = await trx
      .insert(organizationMembers)
      .values({
        organizationId: created.id,
        userSub,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!membership) {
      throw new ValidationError("Failed to create organization membership");
    }

    const orgAdminRole = await trx.query.roles.findFirst({ where: eq(roles.key, "org_admin") });
    if (orgAdminRole) {
      await trx
        .insert(organizationMemberRoles)
        .values({ organizationMemberId: membership.id, roleId: orgAdminRole.id })
        .onConflictDoNothing();
    }

    return {
      organizationId: created.id,
      slug: created.slug,
      name: created.name,
      membershipId: membership.id,
      status: membership.status,
    };
  });
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
