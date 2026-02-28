import type { IncomingMessage, ServerResponse } from "node:http";
import { count, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { groups, userGroups } from "../../db/schema.ts";
import { ForbiddenError, NotFoundError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getGroupPermissions } from "../../models/groups.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

export async function getGroup(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const Params = z.object({ key: z.string().min(1) });
  const parsed = Params.safeParse({ key });
  if (!parsed.success) {
    throw new NotFoundError("Invalid group key");
  }

  const group = await context.db.query.groups.findFirst({
    where: eq(groups.key, key),
  });

  if (!group) {
    throw new NotFoundError("Group not found");
  }

  const permissions = await getGroupPermissions(context, key);

  const userCountResult = await context.db
    .select({ userCount: count(userGroups.userSub) })
    .from(userGroups)
    .where(eq(userGroups.groupKey, key));

  const userCount = userCountResult[0]?.userCount || 0;

  const responseData = {
    key: group.key,
    name: group.name,
    enableLogin: Boolean(group.enableLogin),
    requireOtp: Boolean(group.requireOtp),
    permissions,
    userCount,
    permissionCount: permissions.length,
  };

  sendJson(response, 200, responseData);
}

const PermissionSchema = z.object({
  key: z.string(),
  description: z.string().nullable(),
});

const GroupDetailSchema = z.object({
  key: z.string(),
  name: z.string(),
  enableLogin: z.boolean(),
  requireOtp: z.boolean(),
  permissions: z.array(PermissionSchema),
  userCount: z.number().int().nonnegative(),
  permissionCount: z.number().int().nonnegative(),
});

export const schema = {
  method: "GET",
  path: "/admin/groups/{key}",
  tags: ["Groups"],
  summary: "Get group details",
  params: z.object({ key: z.string() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: GroupDetailSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
