import { count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { groups, userGroups, users } from "../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function listUsers(
  context: Context,
  options: { page?: number; limit?: number; search?: string } = {}
) {
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

  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const searchCondition = searchTerm
    ? or(ilike(users.email, searchTerm), ilike(users.name, searchTerm))
    : undefined;

  const totalCount = await (searchCondition
    ? context.db.select({ count: count() }).from(users).where(searchCondition)
    : context.db.select({ count: count() }).from(users));

  const usersList = await (searchCondition ? baseQuery.where(searchCondition) : baseQuery)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const subs = usersList.map((u) => u.sub);
  let groupsByUser = new Map<string, string[]>();
  if (subs.length > 0) {
    const rows = await context.db
      .select({ userSub: userGroups.userSub, groupKey: groups.key })
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
    users: usersList.map((u) => ({ ...u, groups: groupsByUser.get(u.sub) || [] })),
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

export async function createUser(
  context: Context,
  data: { email: string; name?: string; sub?: string }
) {
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : undefined;
  const subInput = typeof data.sub === "string" ? data.sub.trim() : undefined;
  if (!email) throw new ValidationError("Email is required");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new ValidationError("Invalid email format");
  const existing = await context.db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) throw new ConflictError("User with this email already exists");
  const sub = subInput || (await (await import("../utils/crypto.js")).generateRandomString(16));
  await context.db.transaction(async (tx) => {
    await tx.insert(users).values({ sub, email, name: name || null, createdAt: new Date() });
    const { userGroups } = await import("../db/schema.js");
    await tx.insert(userGroups).values({ userSub: sub, groupKey: "default" });
  });
  return { sub, email, name, createdAt: new Date().toISOString() };
}

export async function deleteUser(context: Context, sub: string) {
  if (!sub) throw new ValidationError("User sub is required");
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  await context.db.delete(users).where(eq(users.sub, sub));
  return { success: true } as const;
}

export async function getUserBySub(context: Context, sub: string) {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  return user;
}

export async function getUserBySubOrEmail(context: Context, subOrEmail: string) {
  const { eq } = await import("drizzle-orm");
  const isEmail = subOrEmail.includes("@");
  const user = await context.db.query.users.findFirst({
    where: isEmail ? eq(users.email, subOrEmail) : eq(users.sub, subOrEmail),
  });
  return user;
}

export async function updateUserBasic(
  context: Context,
  sub: string,
  data: { email?: string | null; name?: string | null }
) {
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  const updates: { email?: string | null; name?: string | null } = {};
  if ("email" in data) {
    if (data.email === null || data.email === "") {
      updates.email = null;
    } else if (typeof data.email === "string") {
      const email = data.email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) throw new ValidationError("Invalid email format");
      const { and, ne } = await import("drizzle-orm");
      const other = await context.db.query.users.findFirst({
        where: and(eq(users.email, email), ne(users.sub, sub)),
      });
      if (other) throw new ConflictError("User with this email already exists");
      updates.email = email;
    } else {
      throw new ValidationError("Invalid email value");
    }
  }
  if ("name" in data) {
    if (data.name === null) updates.name = null;
    else if (typeof data.name === "string") updates.name = data.name.trim();
    else throw new ValidationError("Invalid name value");
  }
  if (Object.keys(updates).length === 0) return existing;
  await context.db.update(users).set(updates).where(eq(users.sub, sub));
  const updated = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  return updated || existing;
}

export async function setUserPasswordResetRequired(
  context: Context,
  sub: string,
  required: boolean
) {
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  await context.db.update(users).set({ passwordResetRequired: required }).where(eq(users.sub, sub));
  return { success: true as const };
}

export async function getUserOpaqueRecordByEmail(context: Context, email: string) {
  const { eq } = await import("drizzle-orm");
  const { opaqueRecords, users } = await import("../db/schema.js");
  const { NotFoundError } = await import("../errors.js");
  const user = await context.db.query.users.findFirst({
    where: eq(users.email, email),
    with: { opaqueRecord: true },
  });
  if (!user) throw new NotFoundError("User not found");
  if (!user.opaqueRecord) throw new NotFoundError("User has no authentication record");
  let envelope = user.opaqueRecord.envelope as Buffer | string | null;
  let serverPubkey = user.opaqueRecord.serverPubkey as Buffer | string | null;
  if (
    !envelope ||
    (typeof envelope === "string" ? envelope.length === 0 : (envelope as Buffer).length === 0)
  ) {
    const rec = await context.db.query.opaqueRecords.findFirst({
      where: eq(opaqueRecords.sub, user.sub),
    });
    envelope = rec?.envelope ?? envelope;
    serverPubkey = rec?.serverPubkey ?? serverPubkey;
  }
  return { user, envelope, serverPubkey };
}
