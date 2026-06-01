import { and, eq } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  rolePermissions,
  roles,
} from "../db/schema.ts";
import { AppError, ForbiddenError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";

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
      forceOtp: organizations.forceOtp,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userSub, userSub));

  return rows;
}

export async function isUserOtpRequired(context: Context, userSub: string): Promise<boolean> {
  const organizations = await getUserOrganizations(context, userSub);
  return organizations.some((membership) => membership.status === "active" && membership.forceOtp);
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
      throw new ForbiddenError("Your account cannot sign in with the selected organization.");
    }

    return row[0];
  }

  const rows = await context.db
    .select({ organizationId: organizations.id, organizationSlug: organizations.slug })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")));

  if (rows.length === 0) {
    throw new ForbiddenError("Your account is not a member of any active organization.");
  }

  if (rows.length > 1) {
    throw new AppError("Organization context required", "ORG_CONTEXT_REQUIRED", 400, {
      reason: "multiple_active_organizations",
    });
  }

  return rows[0] as { organizationId: string; organizationSlug: string | null };
}

export async function resolveAuthorizationOrganizationContext(
  context: Context,
  userSub: string,
  options: {
    explicitOrganizationId?: string;
    pendingOrganizationId?: string | null;
    sessionOrganizationId?: string;
  }
): Promise<{ organizationId: string; organizationSlug: string | null }> {
  const preferredOrganizationId = options.explicitOrganizationId || options.pendingOrganizationId;
  if (preferredOrganizationId) {
    return resolveOrganizationContext(context, userSub, preferredOrganizationId);
  }

  if (options.sessionOrganizationId) {
    const row = await context.db
      .select({ organizationId: organizations.id, organizationSlug: organizations.slug })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMembers.userSub, userSub),
          eq(organizationMembers.organizationId, options.sessionOrganizationId),
          eq(organizationMembers.status, "active")
        )
      )
      .limit(1);

    if (row[0]) return row[0];
  }

  return resolveOrganizationContext(context, userSub);
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
