import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { setUserPermissions } from "../../models/userPermissions.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, HttpHandler } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function updateUserPermissionsHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  // Require admin session with write permission
  const sessionData = await requireSession(context, request, true);

  if (sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  if (!userSub || typeof userSub !== "string") {
    throw new ValidationError("Invalid user subject");
  }

  // Read and parse request body
  const body = await readBody(request);
  const data = parseJsonSafely(body) as Record<string, unknown>;

  if (!Array.isArray(data.permissionKeys)) {
    throw new ValidationError("permissionKeys must be an array");
  }

  // Validate permission keys are strings
  if (!data.permissionKeys.every((key): key is string => typeof key === "string")) {
    throw new ValidationError("All permission keys must be strings");
  }

  // At this point, we know permissionKeys is string[]
  const permissionKeys = data.permissionKeys as string[];

  const responseData = {
    success: true,
    ...(await setUserPermissions(context, userSub, permissionKeys)),
  };

  sendJson(response, 200, responseData);
}

export const updateUserPermissions = withAudit({
  eventType: "USER_PERMISSIONS_UPDATE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateUserPermissionsHandler as HttpHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ permissionKeys: z.array(z.string()) });
  const Resp = z.object({
    success: z.boolean(),
    user: z.object({
      sub: z.string(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    }),
    directPermissions: z.array(z.object({ key: z.string(), description: z.string() })),
  });
  registry.registerPath({
    method: "put",
    path: "/admin/users/{sub}/permissions",
    tags: ["Users"],
    summary: "Update user permissions",
    request: {
      params: z.object({ sub: z.string() }),
      body: { content: { "application/json": { schema: Req } } },
    },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
  });
}
