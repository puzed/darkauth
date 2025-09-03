import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { groups, userGroups, users } from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getGroupUsers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  groupKey: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }
  if (!groupKey || typeof groupKey !== "string") {
    throw new ValidationError("Invalid group key");
  }
  const group = await context.db.query.groups.findFirst({ where: eq(groups.key, groupKey) });
  if (!group) {
    throw new NotFoundError("Group not found");
  }
  const groupUsers = await context.db
    .select({ sub: users.sub, email: users.email, name: users.name })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userSub, users.sub))
    .where(eq(userGroups.groupKey, groupKey));
  const allUsers = await context.db
    .select({ sub: users.sub, email: users.email, name: users.name })
    .from(users);
  const responseData = {
    group: { key: group.key, name: group.name },
    users: groupUsers,
    availableUsers: allUsers,
  };
  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const User = z.object({
    sub: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  });
  const Group = z.object({ key: z.string(), name: z.string() });
  const Resp = z.object({ group: Group, users: z.array(User), availableUsers: z.array(User) });
  registry.registerPath({
    method: "get",
    path: "/admin/groups/{key}/users",
    tags: ["Groups"],
    summary: "Get group users",
    request: { params: z.object({ key: z.string() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
