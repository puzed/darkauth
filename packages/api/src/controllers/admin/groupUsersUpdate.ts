import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq, inArray } from "drizzle-orm";
import { groups, userGroups, users } from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, HttpHandler } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function updateGroupUsersHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  groupKey: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }
  if (!groupKey || typeof groupKey !== "string") {
    throw new ValidationError("Invalid group key");
  }
  const body = await readBody(request);
  const data = parseJsonSafely(body) as Record<string, unknown>;
  const userSubs: string[] = Array.isArray(data.userSubs)
    ? data.userSubs
    : Array.isArray(data.users)
      ? data.users
      : [];
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
  sendJson(response, 200, { success: true, users: updatedUsers });
}

export const updateGroupUsers = withAudit({
  eventType: "GROUP_USERS_UPDATE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateGroupUsersHandler as HttpHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const UpdateGroupUsersRequestSchema = z
    .object({ userSubs: z.array(z.string()).optional(), users: z.array(z.string()).optional() })
    .refine((d) => d.userSubs !== undefined || d.users !== undefined, {
      message: "Provide userSubs or users",
    });
  const UpdateGroupUsersResponseSchema = z.object({
    success: z.boolean(),
    users: z.array(
      z.object({
        sub: z.string(),
        email: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
      })
    ),
  });

  registry.registerPath({
    method: "put",
    path: "/admin/groups/{key}/users",
    tags: ["Groups"],
    summary: "Update group users",
    request: {
      params: z.object({ key: z.string() }),
      body: { content: { "application/json": { schema: UpdateGroupUsersRequestSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: UpdateGroupUsersResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
