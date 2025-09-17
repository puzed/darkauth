import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { setGroupUsers } from "../../models/groups.js";
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
  const Params = z.object({ key: z.string() });
  const { key } = Params.parse({ key: groupKey });
  const body = await readBody(request);
  const data = parseJsonSafely(body) as Record<string, unknown>;
  const Req = z
    .object({ userSubs: z.array(z.string()).optional(), users: z.array(z.string()).optional() })
    .refine((d) => d.userSubs !== undefined || d.users !== undefined, {
      message: "Provide userSubs or users",
    });
  const parsed = Req.parse(data);
  const userSubs = parsed.userSubs ?? parsed.users ?? [];
  const result = await setGroupUsers(context, key, userSubs);
  sendJson(response, 200, result);
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
