import { and, eq } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  rolePermissions,
  roles,
} from "../db/schema.js";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function getUserOrganizations(context: Context, userSub: string) {
  if (!userSub || typeof userSub !== "string") {
    throw new ValidationError("Invalid user subject");
  }

  const rows = await context.db
    .select({
      membershipId: organizationMembers.id,
      organizationId: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userSub, userSub));

  return rows;
}

export async function hasUserActiveMembership(
  context: Context,
  userSub: string,
  organizationId: string
): Promise<boolean> {
  const row = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userSub, userSub),
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.status, "active")
    ),
  });

  return !!row;
}

export async function resolveOrganizationContext(
  context: Context,
  userSub: string,
  explicitOrganizationId?: string
): Promise<{ organizationId: string; organizationSlug: string | null }> {
  if (explicitOrganizationId) {
    const row = await context.db
      .select({ organizationId: organizations.id, organizationSlug: organizations.slug })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMembers.userSub, userSub),
          eq(organizationMembers.organizationId, explicitOrganizationId),
          eq(organizationMembers.status, "active")
        )
      )
      .limit(1);

    if (!row[0]) {
      throw new NotFoundError("Organization not found");
    }

    return row[0];
  }

  const rows = await context.db
    .select({ organizationId: organizations.id, organizationSlug: organizations.slug })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")));

  if (rows.length === 0) {
    throw new ForbiddenError("No active organization membership");
  }

  if (rows.length > 1) {
    throw new AppError("Organization context required", "ORG_CONTEXT_REQUIRED", 400);
  }

  return rows[0] as { organizationId: string; organizationSlug: string | null };
}

export async function getUserOrgAccess(context: Context, userSub: string, organizationId: string) {
  const membership = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userSub, userSub),
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.status, "active")
    ),
  });

  if (!membership) {
    throw new ForbiddenError("No active organization membership");
  }

  const roleRows = await context.db
    .select({ key: roles.key })
    .from(organizationMemberRoles)
    .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
    .where(eq(organizationMemberRoles.organizationMemberId, membership.id));

  const roleKeys = Array.from(new Set(roleRows.map((row) => row.key))).sort();

  const permissionRows = await context.db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(organizationMemberRoles)
    .innerJoin(rolePermissions, eq(organizationMemberRoles.roleId, rolePermissions.roleId))
    .where(eq(organizationMemberRoles.organizationMemberId, membership.id));

  const permissions = Array.from(new Set(permissionRows.map((row) => row.permissionKey))).sort();

  return {
    membershipId: membership.id,
    roleKeys,
    permissions,
  };
}
