import { count, eq } from "drizzle-orm";
import { groupPermissions, groups, userGroups } from "../db/schema.js";
import { NotFoundError, ConflictError } from "../errors.js";
import type { Context } from "../types.js";

export type Group = {
  key: string;
  name: string;
  permissionCount: number;
  userCount: number;
};

export type ListGroupsOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export type ListGroupsResult = {
  groups: Group[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export async function listGroups(
  context: Context,
  options: ListGroupsOptions = {}
): Promise<ListGroupsResult> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const baseQuery = context.db
    .select({
      key: groups.key,
      name: groups.name,
    })
    .from(groups);

  const baseCountQuery = context.db.select({ count: count() }).from(groups);

  let searchCondition;
  if (options.search?.trim()) {
    const { ilike, or } = await import("drizzle-orm");
    const term = `%${options.search.trim()}%`;
    searchCondition = or(ilike(groups.name, term), ilike(groups.key, term));
  }

  const totalRows = await (searchCondition
    ? baseCountQuery.where(searchCondition)
    : baseCountQuery);
  const total = totalRows[0]?.count || 0;

  const groupsData = await (searchCondition 
    ? baseQuery.where(searchCondition) 
    : baseQuery)
    .orderBy(groups.name)
    .limit(limit)
    .offset(offset);

  // Get permission counts for each group
  const permissionCounts = await context.db
    .select({
      groupKey: groupPermissions.groupKey,
      permissionCount: count(groupPermissions.permissionKey),
    })
    .from(groupPermissions)
    .groupBy(groupPermissions.groupKey);

  // Get user counts for each group
  const userCounts = await context.db
    .select({
      groupKey: userGroups.groupKey,
      userCount: count(userGroups.userSub),
    })
    .from(userGroups)
    .groupBy(userGroups.groupKey);

  // Create maps for efficient lookup
  const permissionCountMap = new Map(
    permissionCounts.map((pc) => [pc.groupKey, pc.permissionCount])
  );
  const userCountMap = new Map(
    userCounts.map((uc) => [uc.groupKey, uc.userCount])
  );

  // Build response with counts
  const groupsWithCounts = groupsData.map((group) => ({
    key: group.key,
    name: group.name,
    permissionCount: permissionCountMap.get(group.key) || 0,
    userCount: userCountMap.get(group.key) || 0,
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    groups: groupsWithCounts,
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

export async function getGroupByKey(context: Context, key: string): Promise<Group> {
  const result = await context.db
    .select({
      key: groups.key,
      name: groups.name,
    })
    .from(groups)
    .where(eq(groups.key, key))
    .limit(1);

  if (!result[0]) {
    throw new NotFoundError("Group not found");
  }

  // Get permission and user counts
  const permissionCount = await context.db
    .select({ count: count() })
    .from(groupPermissions)
    .where(eq(groupPermissions.groupKey, key));

  const userCount = await context.db
    .select({ count: count() })
    .from(userGroups)
    .where(eq(userGroups.groupKey, key));

  return {
    key: result[0].key,
    name: result[0].name,
    permissionCount: permissionCount[0]?.count || 0,
    userCount: userCount[0]?.count || 0,
  };
}

export async function createGroup(
  context: Context,
  data: {
    key: string;
    name: string;
  }
): Promise<Group> {
  const existing = await context.db
    .select({ key: groups.key })
    .from(groups)
    .where(eq(groups.key, data.key))
    .limit(1);

  if (existing[0]) {
    throw new ConflictError("Group with this key already exists");
  }

  const result = await context.db
    .insert(groups)
    .values(data)
    .returning();

  return {
    key: result[0].key,
    name: result[0].name,
    permissionCount: 0,
    userCount: 0,
  };
}

export async function updateGroup(
  context: Context,
  key: string,
  data: {
    name?: string;
  }
): Promise<Group> {
  const existing = await context.db
    .select({ key: groups.key })
    .from(groups)
    .where(eq(groups.key, key))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError("Group not found");
  }

  const result = await context.db
    .update(groups)
    .set(data)
    .where(eq(groups.key, key))
    .returning();

  // Get updated counts
  const permissionCount = await context.db
    .select({ count: count() })
    .from(groupPermissions)
    .where(eq(groupPermissions.groupKey, key));

  const userCount = await context.db
    .select({ count: count() })
    .from(userGroups)
    .where(eq(userGroups.groupKey, key));

  return {
    key: result[0].key,
    name: result[0].name,
    permissionCount: permissionCount[0]?.count || 0,
    userCount: userCount[0]?.count || 0,
  };
}

export async function deleteGroup(context: Context, key: string) {
  const result = await context.db
    .delete(groups)
    .where(eq(groups.key, key))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("Group not found");
  }

  return { success: true };
}