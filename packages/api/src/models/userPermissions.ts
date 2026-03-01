import { and, eq, inArray } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  permissions,
  rolePermissions,
  roles,
  userPermissions,
  users,
} from "../db/schema.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";

export async function setUserPermissions(
  context: Context,
  userSub: string,
  permissionKeys: string[]
) {
  if (!userSub) throw new ValidationError("Invalid user subject");
  if (!Array.isArray(permissionKeys)) throw new ValidationError("permissionKeys must be an array");
  if (!permissionKeys.every((k) => typeof k === "string"))
    throw new ValidationError("All permission keys must be strings");
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
  if (!user) throw new NotFoundError("User not found");
  if (permissionKeys.length > 0) {
    const existing = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));
    if (existing.length !== permissionKeys.length) {
      const existingKeys = existing.map((p) => p.key);
      const missing = permissionKeys.filter((k) => !existingKeys.includes(k));
      throw new ValidationError(`Permissions not found: ${missing.join(", ")}`);
    }
  }
  await context.db.transaction(async (trx) => {
    await trx.delete(userPermissions).where(eq(userPermissions.userSub, userSub));
    if (permissionKeys.length > 0) {
      await trx
        .insert(userPermissions)
        .values(permissionKeys.map((permissionKey) => ({ userSub, permissionKey })));
    }
  });
  const updated = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionKey, permissions.key))
    .where(eq(userPermissions.userSub, userSub))
    .orderBy(permissions.key);
  return { user, directPermissions: updated };
}

export async function getUserPermissionsDetails(context: Context, userSub: string) {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
  if (!user) throw new NotFoundError("User not found");
  const directPermissions = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionKey, permissions.key))
    .where(eq(userPermissions.userSub, userSub))
    .orderBy(permissions.key);
  const inheritedPermissionsData = await context.db
    .select({
      permissionKey: permissions.key,
      permissionDescription: permissions.description,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(organizationMembers)
    .innerJoin(
      organizationMemberRoles,
      eq(organizationMemberRoles.organizationMemberId, organizationMembers.id)
    )
    .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionKey, permissions.key))
    .where(and(eq(organizationMembers.userSub, userSub), eq(organizationMembers.status, "active")))
    .orderBy(permissions.key);
  const inheritedMap = new Map<
    string,
    {
      key: string;
      description: string;
      roles: Array<{ roleId: string; roleKey: string; roleName: string }>;
    }
  >();
  for (const item of inheritedPermissionsData) {
    if (!inheritedMap.has(item.permissionKey)) {
      inheritedMap.set(item.permissionKey, {
        key: item.permissionKey,
        description: item.permissionDescription,
        roles: [],
      });
    }
    const entry = inheritedMap.get(item.permissionKey);
    if (entry && !entry.roles.some((role) => role.roleId === item.roleId)) {
      entry.roles.push({ roleId: item.roleId, roleKey: item.roleKey, roleName: item.roleName });
    }
  }
  const inheritedPermissions = Array.from(inheritedMap.values());
  const availablePermissions = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(permissions)
    .orderBy(permissions.key);
  return { user, directPermissions, inheritedPermissions, availablePermissions };
}
