import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { getUserGroups as getUserGroupsModel } from "../../models/groups.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getUserGroups(
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

  const result = await getUserGroupsModel(context, userSub);
  sendJson(response, 200, result);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Group = z.object({ key: z.string(), name: z.string() });
  const User = z.object({
    sub: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  });
  const Resp = z.object({
    user: User,
    userGroups: z.array(Group),
    availableGroups: z.array(Group),
  });
  registry.registerPath({
    method: "get",
    path: "/admin/users/{sub}/groups",
    tags: ["Users"],
    summary: "Get user groups",
    request: { params: z.object({ sub: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
  });
}
