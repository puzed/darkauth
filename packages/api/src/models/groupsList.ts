import { asc, count, desc, ilike, or, sql } from "drizzle-orm";
import { groupPermissions, groups, userGroups } from "../db/schema.js";
import type { Context } from "../types.js";

export async function listGroupsWithCounts(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: "key" | "name";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "name";
  const sortOrder = options.sortOrder || "asc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn = sortBy === "key" ? groups.key : groups.name;

  let includeEnable = true;
  const baseQuery = context.db.select({ key: groups.key, name: groups.name }).from(groups);
  const baseCountQuery = context.db.select({ count: count() }).from(groups);
  const term = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const searchCondition = term ? or(ilike(groups.name, term), ilike(groups.key, term)) : undefined;

  const totalRows = await (searchCondition
    ? baseCountQuery.where(searchCondition)
    : baseCountQuery);
  const total = totalRows[0]?.count || 0;

  let groupsData: Array<{
    key: string;
    name: string;
    enableLogin?: boolean;
    requireOtp?: boolean;
  }> = [];
  try {
    const q = context.db
      .select({
        key: groups.key,
        name: groups.name,
        enableLogin: groups.enableLogin,
        requireOtp: groups.requireOtp,
      })
      .from(groups);
    groupsData = await (searchCondition ? q.where(searchCondition) : q)
      .orderBy(sql`CASE WHEN ${groups.key} = 'default' THEN 0 ELSE 1 END`, sortFn(sortColumn))
      .limit(limit)
      .offset(offset);
  } catch {
    includeEnable = false;
    groupsData = await (searchCondition ? baseQuery.where(searchCondition) : baseQuery)
      .orderBy(sql`CASE WHEN ${groups.key} = 'default' THEN 0 ELSE 1 END`, sortFn(sortColumn))
      .limit(limit)
      .offset(offset);
  }

  const permissionCounts = await context.db
    .select({
      groupKey: groupPermissions.groupKey,
      permissionCount: count(groupPermissions.permissionKey),
    })
    .from(groupPermissions)
    .groupBy(groupPermissions.groupKey);

  const userCounts = await context.db
    .select({ groupKey: userGroups.groupKey, userCount: count(userGroups.userSub) })
    .from(userGroups)
    .groupBy(userGroups.groupKey);

  const permissionCountMap = new Map(
    permissionCounts.map((pc) => [pc.groupKey, pc.permissionCount])
  );
  const userCountMap = new Map(userCounts.map((uc) => [uc.groupKey, uc.userCount]));

  const groupsWithCounts = groupsData.map((group) => ({
    key: group.key,
    name: group.name,
    ...(includeEnable
      ? { enableLogin: Boolean(group.enableLogin), requireOtp: Boolean(group.requireOtp) }
      : {}),
    permissionCount: permissionCountMap.get(group.key) || 0,
    userCount: userCountMap.get(group.key) || 0,
  }));

  const totalPages = Math.ceil(total / limit);
  return {
    groups: groupsWithCounts,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}
