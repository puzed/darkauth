import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { getGroupUsers as getGroupUsersModel } from "../../models/groups.js";
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
  const Params = z.object({ key: z.string() });
  const { key } = Params.parse({ key: groupKey });
  const result = await getGroupUsersModel(context, key);
  sendJson(response, 200, result);
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
