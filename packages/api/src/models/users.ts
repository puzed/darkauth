import { count, desc, eq, inArray } from "drizzle-orm";
import { groups, userGroups, users } from "../db/schema.js";
import { NotFoundError, ConflictError } from "../errors.js";
import type { Context } from "../types.js";

export type ListUsersOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export type ListUsersResult = {
  users: Array<{
    sub: string;
    email: string | null;
    name: string | null;
    createdAt: Date;
    passwordResetRequired: boolean | null;
    groups: string[];
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export async function listUsers(
  context: Context,
  options: ListUsersOptions = {}
): Promise<ListUsersResult> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const baseQuery = context.db
    .select({
      sub: users.sub,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      passwordResetRequired: users.passwordResetRequired,
    })
    .from(users);

  let searchCondition;
  if (options.search?.trim()) {
    const { ilike, or } = await import("drizzle-orm");
    const searchTerm = `%${options.search.trim()}%`;
    searchCondition = or(
      ilike(users.email, searchTerm),
      ilike(users.name, searchTerm)
    );
  }

  const totalCount = await (searchCondition
    ? context.db.select({ count: count() }).from(users).where(searchCondition)
    : context.db.select({ count: count() }).from(users));

  const usersList = await (searchCondition ? baseQuery.where(searchCondition) : baseQuery)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  // Get groups for each user
  const subs = usersList.map((u) => u.sub);
  let groupsByUser = new Map<string, string[]>();
  
  if (subs.length > 0) {
    const rows = await context.db
      .select({
        userSub: userGroups.userSub,
        groupKey: groups.key,
      })
      .from(userGroups)
      .innerJoin(groups, eq(userGroups.groupKey, groups.key))
      .where(inArray(userGroups.userSub, subs));
      
    groupsByUser = rows.reduce((map, row) => {
      const list = map.get(row.userSub) || [];
      list.push(row.groupKey);
      map.set(row.userSub, list);
      return map;
    }, new Map<string, string[]>());
  }

  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    users: usersList.map((u) => ({ 
      ...u, 
      groups: groupsByUser.get(u.sub) || [] 
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

export async function getUserBySub(context: Context, sub: string) {
  const result = await context.db
    .select({
      sub: users.sub,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      passwordResetRequired: users.passwordResetRequired,
    })
    .from(users)
    .where(eq(users.sub, sub))
    .limit(1);

  if (!result[0]) {
    throw new NotFoundError("User not found");
  }

  return result[0];
}

export async function createUser(
  context: Context,
  data: {
    sub: string;
    email?: string | null;
    name?: string | null;
  }
) {
  const existing = await context.db
    .select({ sub: users.sub })
    .from(users)
    .where(eq(users.sub, data.sub))
    .limit(1);

  if (existing[0]) {
    throw new ConflictError("User with this sub already exists");
  }

  const result = await context.db
    .insert(users)
    .values(data)
    .returning();

  return result[0];
}

export async function updateUser(
  context: Context,
  sub: string,
  data: {
    email?: string | null;
    name?: string | null;
    passwordResetRequired?: boolean;
  }
) {
  const existing = await context.db
    .select({ sub: users.sub })
    .from(users)
    .where(eq(users.sub, sub))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError("User not found");
  }

  const result = await context.db
    .update(users)
    .set(data)
    .where(eq(users.sub, sub))
    .returning();

  return result[0];
}

export async function deleteUser(context: Context, sub: string) {
  const result = await context.db
    .delete(users)
    .where(eq(users.sub, sub))
    .returning();

  if (!result[0]) {
    throw new NotFoundError("User not found");
  }

  return { success: true };
}