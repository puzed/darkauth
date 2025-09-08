import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { getUserPermissionsDetails } from "../../models/userPermissions.js";
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

  const result = await getUserPermissionsDetails(context, userSub);
  sendJson(response, 200, {
    user: { sub: result.user.sub, email: result.user.email, name: result.user.name },
    directPermissions: result.directPermissions,
    inheritedPermissions: result.inheritedPermissions,
    availablePermissions: result.availablePermissions,
  });
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
