import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { getUserPermissionsDetails } from "../../models/userPermissions.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

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

  const result = await getUserPermissionsDetails(context, userSub);
  sendJson(response, 200, {
    user: { sub: result.user.sub, email: result.user.email, name: result.user.name },
    directPermissions: result.directPermissions,
    inheritedPermissions: result.inheritedPermissions,
    availablePermissions: result.availablePermissions,
  });
}

// Zod schemas for OpenAPI description
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

export const schema = {
  method: "GET",
  path: "/admin/users/{sub}/permissions",
  tags: ["Users"],
  summary: "Get user permissions",
  params: z.object({ sub: z.string() }),
  responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
} as const satisfies ControllerSchema;
