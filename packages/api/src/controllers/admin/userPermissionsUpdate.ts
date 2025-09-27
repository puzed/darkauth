import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError } from "../../errors.js";
import { setUserPermissions } from "../../models/userPermissions.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema, HttpHandler } from "../../types.js";
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

  const Params = z.object({ sub: z.string() });
  const { sub } = Params.parse({ sub: userSub });

  // Read and parse request body
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const Req = z.object({ permissionKeys: z.array(z.string()) });
  const { permissionKeys } = Req.parse(raw);

  const responseData = {
    success: true,
    ...(await setUserPermissions(context, sub, permissionKeys)),
  };

  sendJson(response, 200, responseData);
}

export const updateUserPermissions = withAudit({
  eventType: "USER_PERMISSIONS_UPDATE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateUserPermissionsHandler as HttpHandler);

// OpenAPI schema definition
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

export const schema = {
  method: "PUT",
  path: "/admin/users/{sub}/permissions",
  tags: ["Users"],
  summary: "Update user permissions",
  params: z.object({ sub: z.string() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: Resp } },
    },
  },
} as const satisfies ControllerSchema;
