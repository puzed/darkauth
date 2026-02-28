import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError } from "../../errors.ts";
import { getUserGroups as getUserGroupsModel } from "../../models/groups.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

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
  const Params = z.object({ sub: z.string() });
  const { sub } = Params.parse({ sub: userSub });
  const result = await getUserGroupsModel(context, sub);
  sendJson(response, 200, result);
}

// OpenAPI schema definition
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

export const schema = {
  method: "GET",
  path: "/admin/users/{sub}/groups",
  tags: ["Users"],
  summary: "Get user groups",
  params: z.object({ sub: z.string() }),
  responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
} as const satisfies ControllerSchema;
