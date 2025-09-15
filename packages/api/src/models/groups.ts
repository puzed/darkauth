import { eq, inArray } from "drizzle-orm";
import { groups, userGroups, users } from "../db/schema.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function setGroupUsers(context: Context, groupKey: string, userSubs: string[]) {
  if (!groupKey || typeof groupKey !== "string") {
    throw new ValidationError("Invalid group key");
  }
  if (!Array.isArray(userSubs)) {
    throw new ValidationError("userSubs must be an array");
  }
  for (const sub of userSubs) {
    if (typeof sub !== "string") {
      throw new ValidationError("All user subs must be strings");
    }
  }
  const group = await context.db.query.groups.findFirst({ where: eq(groups.key, groupKey) });
  if (!group) {
    throw new NotFoundError("Group not found");
  }
  if (userSubs.length > 0) {
    const existingUsers = await context.db
      .select({ sub: users.sub })
      .from(users)
      .where(inArray(users.sub, userSubs));
    if (existingUsers.length !== userSubs.length) {
      const existing = new Set(existingUsers.map((u) => u.sub));
      const missing = userSubs.filter((s) => !existing.has(s));
      throw new ValidationError(`Users not found: ${missing.join(", ")}`);
    }
  }
  await context.db.transaction(async (trx) => {
    await trx.delete(userGroups).where(eq(userGroups.groupKey, groupKey));
    if (userSubs.length > 0) {
      await trx.insert(userGroups).values(userSubs.map((sub) => ({ userSub: sub, groupKey })));
    }
  });
  const updatedUsers = await context.db
    .select({ sub: users.sub, email: users.email, name: users.name })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userSub, users.sub))
    .where(eq(userGroups.groupKey, groupKey));
  return { success: true as const, users: updatedUsers };
}

export async function getGroupUsers(context: Context, groupKey: string) {
  const group = await context.db.query.groups.findFirst({ where: eq(groups.key, groupKey) });
  if (!group) throw new NotFoundError("Group not found");
  const groupUsersList = await context.db
    .select({ sub: users.sub, email: users.email, name: users.name })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userSub, users.sub))
    .where(eq(userGroups.groupKey, groupKey));
  const allUsers = await context.db
    .select({ sub: users.sub, email: users.email, name: users.name })
    .from(users);
  return {
    group: { key: group.key, name: group.name },
    users: groupUsersList,
    availableUsers: allUsers,
  };
}

export async function createGroup(
  context: Context,
  data: {
    key: string;
    name: string;
    enableLogin?: boolean;
    requireOtp?: boolean;
    permissionKeys?: string[];
  }
) {
  const { eq, inArray } = await import("drizzle-orm");
  const permissionKeys = data.permissionKeys || [];
  const existingGroup = await context.db.query.groups.findFirst({
    where: eq(groups.key, data.key),
  });
  if (existingGroup)
    throw new (await import("../errors.js")).ConflictError("Group with this key already exists");
  if (permissionKeys.length > 0) {
    const { permissions } = await import("../db/schema.js");
    const existingPermissions = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));
    if (existingPermissions.length !== permissionKeys.length) {
      const existingKeys = existingPermissions.map((p) => p.key);
      const missingKeys = permissionKeys.filter((k) => !existingKeys.includes(k));
      throw new ValidationError(`Permissions not found: ${missingKeys.join(", ")}`);
    }
  }
  await context.db.transaction(async (trx) => {
    await trx.insert(groups).values({
      key: data.key,
      name: data.name,
      enableLogin: data.enableLogin ?? true,
      requireOtp: data.requireOtp ?? false,
    });
    if (permissionKeys.length > 0) {
      const { groupPermissions } = await import("../db/schema.js");
      await trx
        .insert(groupPermissions)
        .values(permissionKeys.map((permissionKey) => ({ groupKey: data.key, permissionKey })));
    }
  });
  const createdGroup = await context.db.query.groups.findFirst({ where: eq(groups.key, data.key) });
  const { permissions, groupPermissions } = await import("../db/schema.js");
  const assignedPermissions = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(groupPermissions)
    .innerJoin(permissions, eq(groupPermissions.permissionKey, permissions.key))
    .where(eq(groupPermissions.groupKey, data.key))
    .orderBy(permissions.key);
  return {
    key: createdGroup?.key as string,
    name: createdGroup?.name as string,
    enableLogin: Boolean(createdGroup?.enableLogin),
    requireOtp: Boolean(createdGroup?.requireOtp),
    permissions: assignedPermissions,
    permissionCount: assignedPermissions.length,
    userCount: 0,
  };
}

export async function setUserGroups(context: Context, userSub: string, groupKeys: string[]) {
  const { eq, inArray } = await import("drizzle-orm");
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
  if (!user) throw new (await import("../errors.js")).NotFoundError("User not found");
  const targetGroups = groupKeys.length > 0 ? groupKeys : ["default"];
  if (targetGroups.length > 0) {
    const existingGroups = await context.db
      .select({ key: groups.key })
      .from(groups)
      .where(inArray(groups.key, targetGroups));
    if (existingGroups.length !== targetGroups.length) {
      const existingKeys = existingGroups.map((g) => g.key);
      const missingKeys = targetGroups.filter((k) => !existingKeys.includes(k));
      throw new ValidationError(`Groups not found: ${missingKeys.join(", ")}`);
    }
  }
  await context.db.transaction(async (trx) => {
    await trx.delete(userGroups).where(eq(userGroups.userSub, userSub));
    if (targetGroups.length > 0) {
      await trx.insert(userGroups).values(targetGroups.map((groupKey) => ({ userSub, groupKey })));
    }
  });
  const updatedUserGroups = await context.db
    .select({ groupKey: groups.key, groupName: groups.name })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupKey, groups.key))
    .where(eq(userGroups.userSub, userSub));
  return {
    user,
    userGroups: updatedUserGroups.map((g) => ({ key: g.groupKey, name: g.groupName })),
  };
}

export async function getUserGroups(context: Context, userSub: string) {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
  if (!user) throw new NotFoundError("User not found");

  const userGroupsList = await context.db
    .select({ key: groups.key, name: groups.name })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupKey, groups.key))
    .where(eq(userGroups.userSub, userSub))
    .orderBy(groups.key);

  const availableGroups = await context.db
    .select({ key: groups.key, name: groups.name })
    .from(groups)
    .orderBy(groups.key);

  return {
    user,
    userGroups: userGroupsList,
    availableGroups,
  };
}

export async function updateGroup(
  context: Context,
  key: string,
  data: { name?: string; enableLogin?: boolean; requireOtp?: boolean }
) {
  const group = await context.db.query.groups.findFirst({ where: eq(groups.key, key) });
  if (!group) throw new NotFoundError("Group not found");
  const updates: { name?: string; enableLogin?: boolean; requireOtp?: boolean } = {};
  if (typeof data.name === "string" && data.name.trim().length > 0) updates.name = data.name.trim();
  if (typeof data.enableLogin === "boolean") updates.enableLogin = data.enableLogin;
  if (typeof data.requireOtp === "boolean") updates.requireOtp = data.requireOtp;
  if (Object.keys(updates).length === 0) return { success: true as const };
  await context.db.update(groups).set(updates).where(eq(groups.key, key));
  return { success: true as const };
}

export async function deleteGroup(context: Context, key: string) {
  const group = await context.db.query.groups.findFirst({ where: eq(groups.key, key) });
  if (!group) throw new NotFoundError("Group not found");
  if (group.key === "default") throw new ValidationError("Cannot delete default group");
  await context.db.delete(groups).where(eq(groups.key, key));
  return { success: true as const };
}
