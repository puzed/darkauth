import { eq, inArray } from "drizzle-orm";
import {
  groupPermissions,
  groups,
  permissions,
  userGroups,
  userPermissions,
  users,
} from "../db/schema.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

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
  const groupPermissionsData = await context.db
    .select({
      permissionKey: permissions.key,
      permissionDescription: permissions.description,
      groupKey: groups.key,
      groupName: groups.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupKey, groups.key))
    .innerJoin(groupPermissions, eq(groups.key, groupPermissions.groupKey))
    .innerJoin(permissions, eq(groupPermissions.permissionKey, permissions.key))
    .where(eq(userGroups.userSub, userSub))
    .orderBy(permissions.key);
  const inheritedMap = new Map<
    string,
    { key: string; description: string; groups: Array<{ key: string; name: string }> }
  >();
  for (const item of groupPermissionsData) {
    if (!inheritedMap.has(item.permissionKey)) {
      inheritedMap.set(item.permissionKey, {
        key: item.permissionKey,
        description: item.permissionDescription,
        groups: [],
      });
    }
    const entry = inheritedMap.get(item.permissionKey);
    if (entry) entry.groups.push({ key: item.groupKey, name: item.groupName });
  }
  const inheritedPermissions = Array.from(inheritedMap.values());
  const availablePermissions = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(permissions)
    .orderBy(permissions.key);
  return { user, directPermissions, inheritedPermissions, availablePermissions };
}
