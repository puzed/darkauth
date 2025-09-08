import { count, desc, eq } from "drizzle-orm";
import { adminUsers } from "../db/schema.js";
import { ConflictError, NotFoundError } from "../errors.js";
import type { Context } from "../types.js";

export async function listAdminUsers(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const baseSelect = {
    id: adminUsers.id,
    email: adminUsers.email,
    name: adminUsers.name,
    role: adminUsers.role,
    passwordResetRequired: adminUsers.passwordResetRequired,
    createdAt: adminUsers.createdAt,
  };

  type AdminUserSelect = {
    id: string;
    email: string;
    name: string;
    role: "read" | "write";
    passwordResetRequired: boolean;
    createdAt: Date;
  };

  let adminUsersList: AdminUserSelect[];
  let totalCount: Array<{ count: number }>;

  if (options.search?.trim()) {
    const { ilike, or } = await import("drizzle-orm");
    const searchTerm = `%${options.search.trim()}%`;
    const searchCondition = or(
      ilike(adminUsers.email, searchTerm),
      ilike(adminUsers.name, searchTerm)
    );

    adminUsersList = await context.db
      .select(baseSelect)
      .from(adminUsers)
      .where(searchCondition)
      .orderBy(desc(adminUsers.createdAt))
      .limit(limit)
      .offset(offset);

    totalCount = await context.db
      .select({ count: count() })
      .from(adminUsers)
      .where(searchCondition);
  } else {
    adminUsersList = await context.db
      .select(baseSelect)
      .from(adminUsers)
      .orderBy(desc(adminUsers.createdAt))
      .limit(limit)
      .offset(offset);

    totalCount = await context.db.select({ count: count() }).from(adminUsers);
  }

  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    adminUsers: adminUsersList,
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

export async function getAdminUser(context: Context, adminId: string) {
  const result = await context.db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1);

  if (!result[0]) {
    throw new NotFoundError("Admin user not found");
  }

  return result[0];
}

export async function getAdminById(context: Context, adminId: string) {
  const result = await context.db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      passwordResetRequired: adminUsers.passwordResetRequired,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1);
  return result[0] || null;
}

export async function getAdminByEmail(context: Context, email: string) {
  const { eq } = await import("drizzle-orm");
  const result = await context.db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  return result[0] || null;
}

export async function setAdminPasswordResetRequired(
  context: Context,
  adminId: string,
  required: boolean
) {
  const existing = await context.db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1);
  if (!existing[0]) throw new NotFoundError("Admin user not found");
  await context.db
    .update(adminUsers)
    .set({ passwordResetRequired: required })
    .where(eq(adminUsers.id, adminId));
  return { success: true as const };
}

export async function createAdminUser(
  context: Context,
  data: {
    email: string;
    name: string;
    role: "read" | "write";
  }
) {
  const existing = await context.db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, data.email))
    .limit(1);

  if (existing[0]) {
    throw new ConflictError("Admin user with this email already exists");
  }

  const result = await context.db
    .insert(adminUsers)
    .values({
      email: data.email,
      name: data.name,
      role: data.role,
    })
    .returning();

  return result[0];
}

export async function updateAdminUser(
  context: Context,
  adminId: string,
  data: {
    email?: string;
    name?: string;
    role?: "read" | "write";
  }
) {
  const existing = await context.db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError("Admin user not found");
  }

  if (data.email) {
    const emailConflict = await context.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, data.email))
      .limit(1);

    if (emailConflict[0] && emailConflict[0].id !== adminId) {
      throw new ConflictError("Admin user with this email already exists");
    }
  }

  const result = await context.db
    .update(adminUsers)
    .set(data)
    .where(eq(adminUsers.id, adminId))
    .returning();

  return result[0];
}

export async function deleteAdminUser(context: Context, adminId: string) {
  const adminUsersList = await context.db.select({ id: adminUsers.id }).from(adminUsers);

  if (adminUsersList.length === 1) {
    throw new ConflictError("Cannot delete the last admin user");
  }

  const result = await context.db.delete(adminUsers).where(eq(adminUsers.id, adminId)).returning();

  if (!result[0]) {
    throw new NotFoundError("Admin user not found");
  }

  return { success: true };
}
