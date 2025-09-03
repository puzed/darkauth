import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { count } from "drizzle-orm";
import { groupPermissions, permissions, userPermissions } from "../../db/schema.js";
import { ForbiddenError } from "../../errors.js";

const PermissionResponseSchema = z.object({
  key: z.string(),
  description: z.string(),
  groupCount: z.number().int().nonnegative(),
  directUserCount: z.number().int().nonnegative(),
});
export const PermissionsListResponseSchema = z.object({
  permissions: z.array(PermissionResponseSchema),
});

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

export async function getPermissions(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const permissionsData = await context.db
    .select({ key: permissions.key, description: permissions.description })
    .from(permissions)
    .orderBy(permissions.key);

  const groupCounts = await context.db
    .select({
      permissionKey: groupPermissions.permissionKey,
      groupCount: count(groupPermissions.groupKey),
    })
    .from(groupPermissions)
    .groupBy(groupPermissions.permissionKey);

  const userCounts = await context.db
    .select({
      permissionKey: userPermissions.permissionKey,
      userCount: count(userPermissions.userSub),
    })
    .from(userPermissions)
    .groupBy(userPermissions.permissionKey);

  const groupCountMap = new Map(groupCounts.map((gc) => [gc.permissionKey, gc.groupCount]));
  const userCountMap = new Map(userCounts.map((uc) => [uc.permissionKey, uc.userCount]));

  const permissionsWithCounts = permissionsData.map((p) => ({
    key: p.key,
    description: p.description,
    groupCount: groupCountMap.get(p.key) || 0,
    directUserCount: userCountMap.get(p.key) || 0,
  }));

  const responseData = { permissions: permissionsWithCounts };
  sendJsonValidated(response, 200, responseData, PermissionsListResponseSchema);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/admin/permissions",
    tags: ["Permissions"],
    summary: "List permissions",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PermissionsListResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
