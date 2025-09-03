import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import {
  groupPermissions,
  groups,
  permissions,
  userGroups,
  userPermissions,
  users,
} from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getUserPermissions(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  // Require admin session
  const sessionData = await requireSession(context, request, true);

  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  if (!userSub || typeof userSub !== "string") {
    throw new ValidationError("Invalid user subject");
  }

  // Verify user exists
  const user = await context.db.query.users.findFirst({
    where: eq(users.sub, userSub),
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Get user's direct permissions
  const directPermissions = await context.db
    .select({
      key: permissions.key,
      description: permissions.description,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionKey, permissions.key))
    .where(eq(userPermissions.userSub, userSub))
    .orderBy(permissions.key);

  // Get permissions inherited from groups
  const groupPermissionsData = await context.db
    .select({
      permissionKey: permissions.key,
      permissionDescription: permissions.description,
      groupKey: groups.key,
      groupName: groups.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupKey, groups.key))
    .innerJoin(groupPermissions, eq(groups.key, groupPermissions.groupKey))
    .innerJoin(permissions, eq(groupPermissions.permissionKey, permissions.key))
    .where(eq(userGroups.userSub, userSub))
    .orderBy(permissions.key);

  // Group permissions by permission key
  const inheritedPermissionsMap = new Map<
    string,
    {
      key: string;
      description: string;
      groups: Array<{ key: string; name: string }>;
    }
  >();

  for (const item of groupPermissionsData) {
    if (!inheritedPermissionsMap.has(item.permissionKey)) {
      inheritedPermissionsMap.set(item.permissionKey, {
        key: item.permissionKey,
        description: item.permissionDescription,
        groups: [],
      });
    }
    inheritedPermissionsMap.get(item.permissionKey)?.groups.push({
      key: item.groupKey,
      name: item.groupName,
    });
  }

  const inheritedPermissions = Array.from(inheritedPermissionsMap.values());

  // Get all available permissions for reference
  const allPermissions = await context.db
    .select({
      key: permissions.key,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(permissions.key);

  const responseData = {
    user: {
      sub: user.sub,
      email: user.email,
      name: user.name,
    },
    directPermissions,
    inheritedPermissions,
    availablePermissions: allPermissions,
  };

  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Group = z.object({ key: z.string(), name: z.string() });
  const Perm = z.object({ key: z.string(), description: z.string() });
  const Resp = z.object({
    user: z.object({
      sub: z.string(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    }),
    directPermissions: z.array(Perm),
    inheritedPermissions: z.array(
      z.object({ key: z.string(), description: z.string(), groups: z.array(Group) })
    ),
    availablePermissions: z.array(Perm),
  });
  registry.registerPath({
    method: "get",
    path: "/admin/users/{sub}/permissions",
    tags: ["Users"],
    summary: "Get user permissions",
    request: { params: z.object({ sub: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
  });
}
