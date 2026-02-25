import { asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { groupPermissions, permissions, userPermissions } from "../db/schema.js";
import { ConflictError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function listPermissionsWithCounts(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: "key" | "description";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "key";
  const sortOrder = options.sortOrder || "asc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn = sortBy === "description" ? permissions.description : permissions.key;
  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const searchCondition = searchTerm
    ? or(ilike(permissions.key, searchTerm), ilike(permissions.description, searchTerm))
    : undefined;

  const totalRows = await (searchCondition
    ? context.db.select({ count: count() }).from(permissions).where(searchCondition)
    : context.db.select({ count: count() }).from(permissions));
  const total = totalRows[0]?.count || 0;

  const permissionsData = await (searchCondition
    ? context.db
        .select({ key: permissions.key, description: permissions.description })
        .from(permissions)
        .where(searchCondition)
    : context.db
        .select({ key: permissions.key, description: permissions.description })
        .from(permissions)
  )
    .orderBy(sortFn(sortColumn), sortFn(permissions.key))
    .limit(limit)
    .offset(offset);

  const permissionKeys = permissionsData.map((permission) => permission.key);
  const groupCounts = permissionKeys.length
    ? await context.db
        .select({
          permissionKey: groupPermissions.permissionKey,
          groupCount: count(groupPermissions.groupKey),
        })
        .from(groupPermissions)
        .where(inArray(groupPermissions.permissionKey, permissionKeys))
        .groupBy(groupPermissions.permissionKey)
    : [];

  const userCounts = permissionKeys.length
    ? await context.db
        .select({
          permissionKey: userPermissions.permissionKey,
          userCount: count(userPermissions.userSub),
        })
        .from(userPermissions)
        .where(inArray(userPermissions.permissionKey, permissionKeys))
        .groupBy(userPermissions.permissionKey)
    : [];

  const groupCountMap = new Map(groupCounts.map((gc) => [gc.permissionKey, gc.groupCount]));
  const userCountMap = new Map(userCounts.map((uc) => [uc.permissionKey, uc.userCount]));

  const totalPages = Math.ceil(total / limit);
  return {
    permissions: permissionsData.map((p) => ({
      key: p.key,
      description: p.description,
      groupCount: groupCountMap.get(p.key) || 0,
      directUserCount: userCountMap.get(p.key) || 0,
    })),
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

export async function createPermission(
  context: Context,
  data: { key: string; description: string }
) {
  if (!data.key || typeof data.key !== "string" || data.key.trim() === "") {
    throw new ValidationError("Permission key must be a non-empty string");
  }

  const existing = await context.db.query.permissions.findFirst({
    where: eq(permissions.key, data.key),
  });
  if (existing) {
    throw new ConflictError("Permission with this key already exists");
  }

  await context.db.insert(permissions).values({
    key: data.key,
    description: data.description,
  });

  return {
    key: data.key,
    description: data.description,
    groupCount: 0,
    directUserCount: 0,
  };
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
