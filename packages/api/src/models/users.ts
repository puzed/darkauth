import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  rolePermissions,
  roles,
  userPermissions,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import {
  createActiveMembershipWithDefaultRoles,
  createPersonalOrganizationForUser,
} from "./organizations.ts";

async function getAccessMapsForSubs(context: Context, subs: string[]) {
  const permissionsByUser = new Map<string, string[]>();
  const organizationRolesByUser = new Map<
    string,
    Array<{ organizationId: string; organizationSlug: string; roleKeys: string[] }>
  >();

  if (subs.length === 0) {
    return { permissionsByUser, organizationRolesByUser };
  }

  const directPermissionsRows = await context.db
    .select({ userSub: userPermissions.userSub, permissionKey: userPermissions.permissionKey })
    .from(userPermissions)
    .where(inArray(userPermissions.userSub, subs));

  const inheritedPermissionRows = await context.db
    .select({
      userSub: organizationMembers.userSub,
      permissionKey: rolePermissions.permissionKey,
    })
    .from(organizationMembers)
    .innerJoin(
      organizationMemberRoles,
      eq(organizationMemberRoles.organizationMemberId, organizationMembers.id)
    )
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, organizationMemberRoles.roleId))
    .where(
      and(inArray(organizationMembers.userSub, subs), eq(organizationMembers.status, "active"))
    );

  const directPermissionsByUser = directPermissionsRows.reduce((map, row) => {
    const list = map.get(row.userSub) || [];
    list.push(row.permissionKey);
    map.set(row.userSub, list);
    return map;
  }, new Map<string, string[]>());

  const inheritedPermissionsByUser = inheritedPermissionRows.reduce((map, row) => {
    const list = map.get(row.userSub) || [];
    list.push(row.permissionKey);
    map.set(row.userSub, list);
    return map;
  }, new Map<string, string[]>());

  for (const sub of subs) {
    const direct = directPermissionsByUser.get(sub) || [];
    const inherited = inheritedPermissionsByUser.get(sub) || [];
    permissionsByUser.set(sub, Array.from(new Set([...direct, ...inherited])).sort());
  }

  const orgRoleRows = await context.db
    .select({
      userSub: organizationMembers.userSub,
      organizationId: organizations.id,
      organizationSlug: organizations.slug,
      roleKey: roles.key,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .leftJoin(
      organizationMemberRoles,
      eq(organizationMemberRoles.organizationMemberId, organizationMembers.id)
    )
    .leftJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
    .where(
      and(inArray(organizationMembers.userSub, subs), eq(organizationMembers.status, "active"))
    );

  for (const row of orgRoleRows) {
    const list = organizationRolesByUser.get(row.userSub) || [];
    let org = list.find((item) => item.organizationId === row.organizationId);
    if (!org) {
      org = {
        organizationId: row.organizationId,
        organizationSlug: row.organizationSlug,
        roleKeys: [],
      };
      list.push(org);
    }
    if (row.roleKey && !org.roleKeys.includes(row.roleKey)) {
      org.roleKeys.push(row.roleKey);
    }
    organizationRolesByUser.set(row.userSub, list);
  }

  for (const sub of subs) {
    const list = organizationRolesByUser.get(sub) || [];
    for (const org of list) org.roleKeys.sort();
    list.sort((a, b) => a.organizationSlug.localeCompare(b.organizationSlug));
    organizationRolesByUser.set(sub, list);
  }

  return { permissionsByUser, organizationRolesByUser };
}

export async function listUsers(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: "createdAt" | "email" | "name" | "sub" | "lastActivityAt";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn =
    sortBy === "email"
      ? users.email
      : sortBy === "name"
        ? users.name
        : sortBy === "sub"
          ? users.sub
          : sortBy === "lastActivityAt"
            ? users.lastActivityAt
            : users.createdAt;

  const baseQuery = context.db
    .select({
      sub: users.sub,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      lastActivityAt: users.lastActivityAt,
      emailVerifiedAt: users.emailVerifiedAt,
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
    .orderBy(sortFn(sortColumn), sortFn(users.sub))
    .limit(limit)
    .offset(offset);

  const subs = usersList.map((u) => u.sub);
  const { permissionsByUser, organizationRolesByUser } = await getAccessMapsForSubs(context, subs);

  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    users: usersList.map((u) => ({
      ...u,
      permissions: permissionsByUser.get(u.sub) || [],
      organizationRoles: organizationRolesByUser.get(u.sub) || [],
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

export async function createUser(
  context: Context,
  data: {
    email: string;
    name?: string;
    sub?: string;
    organizationIds?: string[];
    createPersonalOrganization?: boolean;
    personalOrganizationName?: string;
    personalOrganizationSlug?: string;
  }
) {
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : undefined;
  const subInput = typeof data.sub === "string" ? data.sub.trim() : undefined;
  if (!email) throw new ValidationError("Email is required");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new ValidationError("Invalid email format");
  const existing = await context.db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) throw new ConflictError("Unable to create user");
  const sub = subInput || (await (await import("../utils/crypto.ts")).generateRandomString(16));
  const organizationIds = Array.from(new Set(data.organizationIds || []));
  if (organizationIds.length > 0 && data.createPersonalOrganization === true) {
    throw new ValidationError("Choose organization assignment or personal organization creation");
  }
  await context.db.transaction(async (tx) => {
    await tx.insert(users).values({
      sub,
      email,
      opaqueLoginIdentity: email,
      name: name || null,
      createdAt: new Date(),
    });
    if (organizationIds.length > 0) {
      const existingOrganizations = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(inArray(organizations.id, organizationIds));
      if (existingOrganizations.length !== organizationIds.length) {
        throw new ValidationError("One or more organizations were not found");
      }
      for (const organizationId of organizationIds) {
        await createActiveMembershipWithDefaultRoles(tx, organizationId, sub, false);
      }
    } else {
      await createPersonalOrganizationForUser(tx, sub, name, {
        name: data.personalOrganizationName,
        slug: data.personalOrganizationSlug,
      });
    }
  });
  return { sub, email, name, createdAt: new Date().toISOString(), lastActivityAt: null };
}

export async function deleteUser(context: Context, sub: string) {
  if (!sub) throw new ValidationError("User sub is required");
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  await context.db.delete(users).where(eq(users.sub, sub));
  return { success: true } as const;
}

export function toUserProfileResponse(user: {
  sub: string;
  email: string | null;
  opaqueLoginIdentity?: string | null;
  name: string | null;
  emailVerifiedAt: Date | null;
  pendingEmail: string | null;
  pendingEmailSetAt: Date | null;
}) {
  return {
    sub: user.sub,
    email: user.email,
    name: user.name,
    emailVerified: !!user.emailVerifiedAt,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    pendingEmail: user.pendingEmail,
    pendingEmailSetAt: user.pendingEmailSetAt ? user.pendingEmailSetAt.toISOString() : null,
    signInEmail: user.opaqueLoginIdentity || user.email,
  };
}

export async function getUserProfile(context: Context, sub: string) {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!user) throw new NotFoundError("User not found");
  return toUserProfileResponse(user);
}

export async function updateUserProfileName(
  context: Context,
  sub: string,
  data: { name: string | null }
) {
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  const trimmed = typeof data.name === "string" ? data.name.trim() : "";
  const name = trimmed.length > 0 ? trimmed : null;
  await context.db.update(users).set({ name }).where(eq(users.sub, sub));
  const updated = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  return toUserProfileResponse(updated || { ...existing, name });
}

export async function getUserBySub(context: Context, sub: string) {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  return user;
}

export async function getUsersBySubsWithAccess(context: Context, subs: string[]) {
  if (subs.length === 0) {
    return [];
  }

  const usersList = await context.db
    .select({
      sub: users.sub,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      lastActivityAt: users.lastActivityAt,
    })
    .from(users)
    .where(inArray(users.sub, subs));

  const { permissionsByUser } = await getAccessMapsForSubs(context, subs);

  return usersList.map((user) => ({
    ...user,
    permissions: permissionsByUser.get(user.sub) || [],
  }));
}

export async function getUserBySubWithAccess(context: Context, sub: string) {
  const rows = await getUsersBySubsWithAccess(context, [sub]);
  return rows[0] || null;
}

export async function getUserBySubOrEmail(context: Context, subOrEmail: string) {
  const isEmail = subOrEmail.includes("@");
  const user = await context.db.query.users.findFirst({
    where: isEmail ? eq(users.email, subOrEmail) : eq(users.sub, subOrEmail),
  });
  return user;
}

export async function getUserByOpaqueLoginIdentity(context: Context, identity: string) {
  return await context.db.query.users.findFirst({
    where: or(eq(users.email, identity), eq(users.opaqueLoginIdentity, identity)),
  });
}

export async function updateUserBasic(
  context: Context,
  sub: string,
  data: { email?: string | null; name?: string | null; emailVerified?: boolean }
) {
  const existing = await context.db.query.users.findFirst({ where: eq(users.sub, sub) });
  if (!existing) throw new NotFoundError("User not found");
  const updates: {
    email?: string | null;
    name?: string | null;
    opaqueLoginIdentity?: string | null;
    emailVerifiedAt?: Date | null;
    pendingEmail?: string | null;
    pendingEmailSetAt?: Date | null;
  } = {};
  let emailChanged = false;
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
      if (other) throw new ConflictError("Unable to update user");
      updates.email = email;
    } else {
      throw new ValidationError("Invalid email value");
    }
    emailChanged = updates.email !== existing.email;
    if (emailChanged) {
      updates.emailVerifiedAt = null;
      updates.pendingEmail = null;
      updates.pendingEmailSetAt = null;
    }
  }
  if ("name" in data) {
    if (data.name === null) updates.name = null;
    else if (typeof data.name === "string") updates.name = data.name.trim();
    else throw new ValidationError("Invalid name value");
  }
  if ("emailVerified" in data) {
    if (data.emailVerified === true) {
      if (!("email" in updates ? updates.email : existing.email)) {
        throw new ValidationError("User email is required");
      }
      updates.emailVerifiedAt =
        existing.emailVerifiedAt && !emailChanged ? existing.emailVerifiedAt : new Date();
      updates.pendingEmail = null;
      updates.pendingEmailSetAt = null;
    } else if (data.emailVerified === false) {
      updates.emailVerifiedAt = null;
    } else {
      throw new ValidationError("Invalid email verification value");
    }
  }
  if (Object.keys(updates).length === 0) return existing;
  if ("email" in updates && updates.email) {
    const existingIdentity = existing.opaqueLoginIdentity || existing.email;
    if (!existingIdentity) updates.opaqueLoginIdentity = updates.email;
  }
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
  const { opaqueRecords, users } = await import("../db/schema.ts");
  const { NotFoundError } = await import("../errors.ts");
  const user = await context.db.query.users.findFirst({
    where: or(eq(users.email, email), eq(users.opaqueLoginIdentity, email)),
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
  return {
    user,
    envelope,
    serverPubkey,
    identityU: user.opaqueLoginIdentity || user.email || email,
  };
}

export async function getUserOpaqueRecordHistoryByEmail(context: Context, email: string) {
  const { eq } = await import("drizzle-orm");
  const { userOpaqueRecordHistory, users } = await import("../db/schema.ts");
  const { NotFoundError } = await import("../errors.ts");
  const user = await context.db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) throw new NotFoundError("User not found");
  const history = await context.db.query.userOpaqueRecordHistory.findFirst({
    where: eq(userOpaqueRecordHistory.userSub, user.sub),
  });
  if (!history) throw new NotFoundError("User has no authentication history");
  return {
    user,
    envelope: history.envelope,
    serverPubkey: history.serverPubkey,
  };
}
