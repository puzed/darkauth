import { count } from "drizzle-orm";
import { groupPermissions, permissions, userPermissions } from "../db/schema.js";
import type { Context } from "../types.js";

export async function listPermissionsWithCounts(context: Context) {
  const permissionsData = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(permissions)
    .orderBy(permissions.key);

  const groupCounts = await context.db
    .select({
      permissionKey: groupPermissions.permissionKey,
      groupCount: count(groupPermissions.groupKey),
    })
    .from(groupPermissions)
    .groupBy(groupPermissions.permissionKey);

  const userCounts = await context.db
    .select({
      permissionKey: userPermissions.permissionKey,
      userCount: count(userPermissions.userSub),
    })
    .from(userPermissions)
    .groupBy(userPermissions.permissionKey);

  const groupCountMap = new Map(groupCounts.map((gc) => [gc.permissionKey, gc.groupCount]));
  const userCountMap = new Map(userCounts.map((uc) => [uc.permissionKey, uc.userCount]));

  return permissionsData.map((p) => ({
    key: p.key,
    description: p.description,
    groupCount: groupCountMap.get(p.key) || 0,
    directUserCount: userCountMap.get(p.key) || 0,
  }));
}

export async function deletePermissionByKey(context: Context, key: string) {
  const { permissions } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  const existing = await context.db.query.permissions.findFirst({
    where: eq(permissions.key, key),
  });
  if (!existing) throw new (await import("../errors.js")).NotFoundError("Permission not found");
  await context.db.delete(permissions).where(eq(permissions.key, key));
  return { success: true as const };
}
