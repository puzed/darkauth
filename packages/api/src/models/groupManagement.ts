import { count, desc, eq, sql, inArray, and } from "drizzle-orm";
import { groups, groupPermissions, userGroups, permissions, users } from "../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export interface GroupData {
  key: string;
  name: string;
  description?: string;
  color?: string;
}

export interface GroupWithStats extends GroupData {
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  permissionCount: number;
}

export interface GroupWithDetails extends GroupWithStats {
  users: Array<{ sub: string; name?: string; email?: string }>;
  permissions: Array<{ key: string; name: string; description?: string }>;
}

export interface GroupUpdateData {
  name?: string;
  description?: string;
  color?: string;
}

/**
 * Validates group data
 */
function validateGroupData(data: Partial<GroupData>): void {
  if (data.key) {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.key)) {
      throw new ValidationError("Group key can only contain letters, numbers, underscores, and hyphens");
    }
    if (data.key.length > 50) {
      throw new ValidationError("Group key cannot be longer than 50 characters");
    }
  }

  if (data.name) {
    if (data.name.length === 0) {
      throw new ValidationError("Group name cannot be empty");
    }
    if (data.name.length > 255) {
      throw new ValidationError("Group name cannot be longer than 255 characters");
    }
  }

  if (data.description && data.description.length > 1000) {
    throw new ValidationError("Group description cannot be longer than 1000 characters");
  }

  if (data.color && !/^#[0-9A-Fa-f]{6}$/.test(data.color)) {
    throw new ValidationError("Group color must be a valid hex color code");
  }
}

/**
 * Checks if a group key already exists
 */
export async function checkGroupExists(context: Context, groupKey: string): Promise<boolean> {
  const existing = await context.db
    .select({ key: groups.key })
    .from(groups)
    .where(eq(groups.key, groupKey))
    .limit(1);

  return existing.length > 0;
}

/**
 * Lists all groups with user and permission counts
 */
export async function listGroups(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<{
  groups: GroupWithStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  // Build query with user and permission counts
  const baseQuery = context.db
    .select({
      key: groups.key,
      name: groups.name,
      description: groups.description,
      color: groups.color,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      userCount: count(userGroups.userSub),
      permissionCount: count(groupPermissions.permissionKey),
    })
    .from(groups)
    .leftJoin(userGroups, eq(groups.key, userGroups.groupKey))
    .leftJoin(groupPermissions, eq(groups.key, groupPermissions.groupKey))
    .groupBy(groups.key, groups.name, groups.description, groups.color, groups.createdAt, groups.updatedAt);

  let groupsList: any[];
  let totalCount: any[];

  if (options.search?.trim()) {
    const { ilike, or } = await import("drizzle-orm");
    const searchTerm = `%${options.search.trim()}%`;
    const searchCondition = or(
      ilike(groups.name, searchTerm),
      ilike(groups.description, searchTerm),
      ilike(groups.key, searchTerm)
    );

    groupsList = await baseQuery
      .where(searchCondition)
      .orderBy(desc(groups.createdAt))
      .limit(limit)
      .offset(offset);

    totalCount = await context.db
      .select({ count: count() })
      .from(groups)
      .where(searchCondition);
  } else {
    groupsList = await baseQuery
      .orderBy(desc(groups.createdAt))
      .limit(limit)
      .offset(offset);

    totalCount = await context.db.select({ count: count() }).from(groups);
  }

  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    groups: groupsList.map(g => ({
      key: g.key,
      name: g.name,
      description: g.description,
      color: g.color,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      userCount: g.userCount || 0,
      permissionCount: g.permissionCount || 0,
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

/**
 * Gets a group by key with full details
 */
export async function getGroupByKey(context: Context, groupKey: string): Promise<GroupWithDetails> {
  const group = await context.db.query.groups.findFirst({
    where: eq(groups.key, groupKey),
  });

  if (!group) {
    throw new NotFoundError("Group not found");
  }

  // Get group users
  const groupUsers = await context.db
    .select({
      sub: users.sub,
      name: users.name,
      email: users.email,
    })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userSub, users.sub))
    .where(eq(userGroups.groupKey, groupKey));

  // Get group permissions
  const groupPermissions = await context.db
    .select({
      key: permissions.key,
      name: permissions.name,
      description: permissions.description,
    })
    .from(groupPermissions)
    .innerJoin(permissions, eq(groupPermissions.permissionKey, permissions.key))
    .where(eq(groupPermissions.groupKey, groupKey));

  return {
    key: group.key,
    name: group.name,
    description: group.description,
    color: group.color,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    userCount: groupUsers.length,
    permissionCount: groupPermissions.length,
    users: groupUsers,
    permissions: groupPermissions,
  };
}

/**
 * Creates a new group
 */
export async function createGroup(
  context: Context,
  data: GroupData,
  permissionKeys: string[] = []
): Promise<GroupWithStats> {
  validateGroupData(data);

  // Check if group already exists
  if (await checkGroupExists(context, data.key)) {
    throw new ConflictError("Group with this key already exists");
  }

  // Validate permissions exist
  if (permissionKeys.length > 0) {
    const existingPermissions = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));

    const existingKeys = existingPermissions.map(p => p.key);
    const missingKeys = permissionKeys.filter(key => !existingKeys.includes(key));

    if (missingKeys.length > 0) {
      throw new ValidationError(`Invalid permissions: ${missingKeys.join(", ")}`);
    }
  }

  const now = new Date();

  // Create group
  await context.db.insert(groups).values({
    key: data.key,
    name: data.name,
    description: data.description,
    color: data.color,
    createdAt: now,
    updatedAt: now,
  });

  // Add permissions if provided
  if (permissionKeys.length > 0) {
    const permissionInserts = permissionKeys.map(permissionKey => ({
      groupKey: data.key,
      permissionKey,
      createdAt: now,
    }));

    await context.db.insert(groupPermissions).values(permissionInserts);
  }

  return {
    key: data.key,
    name: data.name,
    description: data.description,
    color: data.color,
    createdAt: now,
    updatedAt: now,
    userCount: 0,
    permissionCount: permissionKeys.length,
  };
}

/**
 * Updates a group
 */
export async function updateGroup(
  context: Context,
  groupKey: string,
  updateData: GroupUpdateData
): Promise<GroupWithStats> {
  validateGroupData(updateData);

  const existing = await context.db.query.groups.findFirst({
    where: eq(groups.key, groupKey),
  });

  if (!existing) {
    throw new NotFoundError("Group not found");
  }

  if (Object.keys(updateData).length === 0) {
    // No changes, return existing
    const stats = await getGroupStats(context, groupKey);
    return {
      ...existing,
      ...stats,
    };
  }

  const result = await context.db
    .update(groups)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(eq(groups.key, groupKey))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("Group not found");
  }

  const updated = result[0];
  const stats = await getGroupStats(context, groupKey);

  return {
    ...updated,
    ...stats,
  };
}

/**
 * Deletes a group
 */
export async function deleteGroup(context: Context, groupKey: string): Promise<{ success: boolean }> {
  // Check if group exists
  const existing = await context.db.query.groups.findFirst({
    where: eq(groups.key, groupKey),
  });

  if (!existing) {
    throw new NotFoundError("Group not found");
  }

  // Remove group permissions
  await context.db.delete(groupPermissions).where(eq(groupPermissions.groupKey, groupKey));

  // Remove user-group associations
  await context.db.delete(userGroups).where(eq(userGroups.groupKey, groupKey));

  // Delete group
  await context.db.delete(groups).where(eq(groups.key, groupKey));

  return { success: true };
}

/**
 * Gets user and permission counts for a group
 */
async function getGroupStats(context: Context, groupKey: string): Promise<{ userCount: number; permissionCount: number }> {
  const userCountResult = await context.db
    .select({ count: count() })
    .from(userGroups)
    .where(eq(userGroups.groupKey, groupKey));

  const permissionCountResult = await context.db
    .select({ count: count() })
    .from(groupPermissions)
    .where(eq(groupPermissions.groupKey, groupKey));

  return {
    userCount: userCountResult[0]?.count || 0,
    permissionCount: permissionCountResult[0]?.count || 0,
  };
}

/**
 * Updates group permissions
 */
export async function updateGroupPermissions(
  context: Context,
  groupKey: string,
  permissionKeys: string[]
): Promise<void> {
  // Check if group exists
  if (!(await checkGroupExists(context, groupKey))) {
    throw new NotFoundError("Group not found");
  }

  // Validate permissions exist
  if (permissionKeys.length > 0) {
    const existingPermissions = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));

    const existingKeys = existingPermissions.map(p => p.key);
    const missingKeys = permissionKeys.filter(key => !existingKeys.includes(key));

    if (missingKeys.length > 0) {
      throw new ValidationError(`Invalid permissions: ${missingKeys.join(", ")}`);
    }
  }

  // Remove existing permissions
  await context.db.delete(groupPermissions).where(eq(groupPermissions.groupKey, groupKey));

  // Add new permissions
  if (permissionKeys.length > 0) {
    const permissionInserts = permissionKeys.map(permissionKey => ({
      groupKey,
      permissionKey,
      createdAt: new Date(),
    }));

    await context.db.insert(groupPermissions).values(permissionInserts);
  }
}

/**
 * Updates group users (members)
 */
export async function updateGroupUsers(
  context: Context,
  groupKey: string,
  userSubs: string[]
): Promise<void> {
  // Check if group exists
  if (!(await checkGroupExists(context, groupKey))) {
    throw new NotFoundError("Group not found");
  }

  // Validate users exist
  if (userSubs.length > 0) {
    const existingUsers = await context.db
      .select({ sub: users.sub })
      .from(users)
      .where(inArray(users.sub, userSubs));

    const existingSubs = existingUsers.map(u => u.sub);
    const missingSubs = userSubs.filter(sub => !existingSubs.includes(sub));

    if (missingSubs.length > 0) {
      throw new ValidationError(`Invalid users: ${missingSubs.join(", ")}`);
    }
  }

  // Remove existing user-group associations
  await context.db.delete(userGroups).where(eq(userGroups.groupKey, groupKey));

  // Add new user-group associations
  if (userSubs.length > 0) {
    const userInserts = userSubs.map(userSub => ({
      groupKey,
      userSub,
      createdAt: new Date(),
    }));

    await context.db.insert(userGroups).values(userInserts);
  }
}