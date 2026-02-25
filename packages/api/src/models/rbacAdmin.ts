import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
} from "../db/schema.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function listOrganizationsAdmin(
  context: Context,
  options: { page: number; limit: number; search?: string }
) {
  const page = Math.max(1, options.page);
  const limit = Math.min(100, Math.max(1, options.limit));
  const offset = (page - 1) * limit;
  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const condition = searchTerm
    ? or(ilike(organizations.name, searchTerm), ilike(organizations.slug, searchTerm))
    : undefined;

  const totalCount = await (condition
    ? context.db.select({ count: count() }).from(organizations).where(condition)
    : context.db.select({ count: count() }).from(organizations));

  const rows = await (condition
    ? context.db
        .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
        .from(organizations)
        .where(condition)
    : context.db
        .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
        .from(organizations)
  )
    .orderBy(desc(organizations.createdAt))
    .limit(limit)
    .offset(offset);

  const orgIds = rows.map((row) => row.id);
  const memberCounts =
    orgIds.length === 0
      ? []
      : await context.db
          .select({
            organizationId: organizationMembers.organizationId,
            memberCount: sql<number>`count(*)::int`,
          })
          .from(organizationMembers)
          .where(inArray(organizationMembers.organizationId, orgIds))
          .groupBy(organizationMembers.organizationId);

  const byOrgId = new Map(memberCounts.map((row) => [row.organizationId, Number(row.memberCount)]));
  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    organizations: rows.map((row) => ({ ...row, memberCount: byOrgId.get(row.id) || 0 })),
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

export async function createOrganizationAdmin(
  context: Context,
  data: { name: string; slug: string }
) {
  const name = data.name.trim();
  const slug = data.slug.trim().toLowerCase();
  if (!name) throw new ValidationError("Organization name is required");
  if (!slug) throw new ValidationError("Organization slug is required");

  const [created] = await context.db
    .insert(organizations)
    .values({ name, slug, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing()
    .returning();

  if (!created) throw new ValidationError("Organization slug already exists");
  return created;
}

export async function getOrganizationAdmin(context: Context, organizationId: string) {
  const [organization] = await context.db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) throw new NotFoundError("Organization not found");

  const members = await context.db
    .select({
      id: organizationMembers.id,
      userSub: organizationMembers.userSub,
      status: organizationMembers.status,
      email: users.email,
      name: users.name,
    })
    .from(organizationMembers)
    .leftJoin(users, eq(organizationMembers.userSub, users.sub))
    .where(eq(organizationMembers.organizationId, organizationId));

  return { organization, members };
}

export async function listOrganizationMembersAdmin(context: Context, organizationId: string) {
  const [organization] = await context.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) throw new NotFoundError("Organization not found");

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

  const memberIds = members.map((member) => member.membershipId);
  const roleRows =
    memberIds.length === 0
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
          .where(inArray(organizationMemberRoles.organizationMemberId, memberIds));

  const rolesByMembership = new Map<string, Array<{ id: string; key: string; name: string }>>();
  for (const roleRow of roleRows) {
    const roleList = rolesByMembership.get(roleRow.membershipId) || [];
    roleList.push({ id: roleRow.roleId, key: roleRow.roleKey, name: roleRow.roleName });
    rolesByMembership.set(roleRow.membershipId, roleList);
  }

  return members.map((member) => ({
    ...member,
    roles: rolesByMembership.get(member.membershipId) || [],
  }));
}

export async function updateOrganizationAdmin(
  context: Context,
  organizationId: string,
  data: { name?: string; slug?: string }
) {
  const updates: { name?: string; slug?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof data.name === "string") updates.name = data.name.trim();
  if (typeof data.slug === "string") updates.slug = data.slug.trim().toLowerCase();

  if (!updates.name && !updates.slug) {
    throw new ValidationError("No updates provided");
  }

  const [updated] = await context.db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, organizationId))
    .returning();

  if (!updated) throw new NotFoundError("Organization not found");
  return updated;
}

export async function deleteOrganizationAdmin(context: Context, organizationId: string) {
  const [deleted] = await context.db
    .delete(organizations)
    .where(eq(organizations.id, organizationId))
    .returning();

  if (!deleted) throw new NotFoundError("Organization not found");
  return { success: true as const };
}

export async function listRolesAdmin(context: Context) {
  const roleRows = await context.db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      system: roles.system,
    })
    .from(roles)
    .orderBy(roles.key);

  const mappings = await context.db
    .select({ roleId: rolePermissions.roleId, permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions);

  const permissionsByRole = mappings.reduce((map, row) => {
    const list = map.get(row.roleId) || [];
    list.push(row.permissionKey);
    map.set(row.roleId, list);
    return map;
  }, new Map<string, string[]>());

  return roleRows.map((role) => ({
    ...role,
    permissionKeys: (permissionsByRole.get(role.id) || []).sort(),
  }));
}

export async function createRoleAdmin(
  context: Context,
  data: { key: string; name: string; description?: string | null; permissionKeys?: string[] }
) {
  const key = data.key.trim();
  const name = data.name.trim();
  if (!key) throw new ValidationError("Role key is required");
  if (!name) throw new ValidationError("Role name is required");

  const permissionKeys = Array.from(new Set(data.permissionKeys || []));
  if (permissionKeys.length > 0) {
    const existing = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));
    if (existing.length !== permissionKeys.length) {
      throw new ValidationError("One or more permissions were not found");
    }
  }

  return context.db.transaction(async (trx) => {
    const [created] = await trx
      .insert(roles)
      .values({
        key,
        name,
        description: data.description || null,
        system: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!created) throw new ValidationError("Role key already exists");

    if (permissionKeys.length > 0) {
      await trx.insert(rolePermissions).values(
        permissionKeys.map((permissionKey) => ({
          roleId: created.id,
          permissionKey,
        }))
      );
    }

    return { ...created, permissionKeys };
  });
}

export async function getRoleAdmin(context: Context, roleId: string) {
  const [role] = await context.db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      system: roles.system,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!role) throw new NotFoundError("Role not found");

  const assignedPermissions = await context.db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));

  return {
    ...role,
    permissionKeys: assignedPermissions.map((row) => row.permissionKey).sort(),
  };
}

export async function updateRoleAdmin(
  context: Context,
  roleId: string,
  data: { name?: string; description?: string | null }
) {
  const existing = await context.db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!existing) throw new NotFoundError("Role not found");
  if (existing.system) throw new ValidationError("System roles cannot be updated");

  const updates: { name?: string; description?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof data.name === "string") updates.name = data.name.trim();
  if (Object.hasOwn(data, "description")) {
    updates.description = data.description ?? null;
  }

  if (!updates.name && !Object.hasOwn(data, "description")) {
    throw new ValidationError("No updates provided");
  }

  const [updated] = await context.db
    .update(roles)
    .set(updates)
    .where(eq(roles.id, roleId))
    .returning();

  if (!updated) throw new NotFoundError("Role not found");
  return updated;
}

export async function deleteRoleAdmin(context: Context, roleId: string) {
  const existing = await context.db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!existing) throw new NotFoundError("Role not found");
  if (existing.system) throw new ValidationError("System roles cannot be deleted");

  await context.db.delete(roles).where(eq(roles.id, roleId));
  return { success: true as const };
}

export async function setRolePermissionsAdmin(
  context: Context,
  roleId: string,
  permissionKeys: string[]
) {
  const existingRole = await context.db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!existingRole) throw new NotFoundError("Role not found");
  if (existingRole.system) throw new ValidationError("System roles cannot be updated");

  const deduped = Array.from(new Set(permissionKeys));

  if (deduped.length > 0) {
    const existingPermissions = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, deduped));

    if (existingPermissions.length !== deduped.length) {
      throw new ValidationError("One or more permissions were not found");
    }
  }

  await context.db.transaction(async (trx) => {
    await trx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (deduped.length > 0) {
      await trx
        .insert(rolePermissions)
        .values(deduped.map((permissionKey) => ({ roleId, permissionKey })));
    }
  });

  return { roleId, permissionKeys: deduped.sort() };
}

export async function setOrganizationMemberRolesAdmin(
  context: Context,
  organizationId: string,
  memberId: string,
  roleIds: string[]
) {
  const member = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId)
    ),
  });

  if (!member) throw new NotFoundError("Organization member not found");

  const dedupedRoleIds = Array.from(new Set(roleIds));
  if (dedupedRoleIds.length > 0) {
    const existingRoles = await context.db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, dedupedRoleIds));
    if (existingRoles.length !== dedupedRoleIds.length) {
      throw new ValidationError("One or more roles were not found");
    }
  }

  await context.db.transaction(async (trx) => {
    await trx
      .delete(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, memberId));

    if (dedupedRoleIds.length > 0) {
      await trx.insert(organizationMemberRoles).values(
        dedupedRoleIds.map((roleId) => ({
          organizationMemberId: memberId,
          roleId,
        }))
      );
    }
  });

  return { memberId, organizationId, roleIds: dedupedRoleIds };
}

export async function addOrganizationMemberRolesAdmin(
  context: Context,
  organizationId: string,
  memberId: string,
  roleIds: string[]
) {
  const member = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId)
    ),
  });
  if (!member) throw new NotFoundError("Organization member not found");

  const dedupedRoleIds = Array.from(new Set(roleIds));
  if (dedupedRoleIds.length === 0) {
    throw new ValidationError("At least one role id is required");
  }

  const existingRoles = await context.db
    .select({ id: roles.id })
    .from(roles)
    .where(inArray(roles.id, dedupedRoleIds));
  if (existingRoles.length !== dedupedRoleIds.length) {
    throw new ValidationError("One or more roles were not found");
  }

  await context.db
    .insert(organizationMemberRoles)
    .values(
      dedupedRoleIds.map((roleId) => ({
        organizationMemberId: memberId,
        roleId,
      }))
    )
    .onConflictDoNothing();

  return { memberId, organizationId, roleIds: dedupedRoleIds };
}

export async function removeOrganizationMemberRoleAdmin(
  context: Context,
  organizationId: string,
  memberId: string,
  roleId: string
) {
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
