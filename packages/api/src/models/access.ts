import { eq, inArray } from "drizzle-orm";
import { groupPermissions, userGroups, userPermissions } from "../db/schema.js";
import type { Context } from "../types.js";

export async function getUserAccess(context: Context, sub: string) {
  const userGroupsData = await context.db.query.userGroups.findMany({
    where: eq(userGroups.userSub, sub),
  });
  const userPermissionsData = await context.db.query.userPermissions.findMany({
    where: eq(userPermissions.userSub, sub),
  });
  const groupsList = Array.from(new Set(userGroupsData.map((g) => g.groupKey)));
  const directPermissions = userPermissionsData.map((p) => p.permissionKey);
  let groupDerived: string[] = [];
  if (groupsList.length > 0) {
    const rows = await context.db
      .select({ permissionKey: groupPermissions.permissionKey })
      .from(groupPermissions)
      .where(inArray(groupPermissions.groupKey, groupsList));
    groupDerived = rows.map((r) => r.permissionKey);
  }
  const uniquePermissions = Array.from(new Set([...directPermissions, ...groupDerived]));
  return { groupsList, permissions: uniquePermissions };
}
