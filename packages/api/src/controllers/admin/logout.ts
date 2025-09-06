import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { deleteSession, getSessionId } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function postAdminLogoutHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  // Get admin session ID from Authorization header
  const sessionId = getSessionId(request, true);

  if (sessionId) {
    // Delete session from database
    await deleteSession(context, sessionId);
  }

  sendJson(response, 200, {
    success: true,
    message: "Logged out successfully",
  });
}

export const postAdminLogout = withAudit({
  eventType: "ADMIN_LOGOUT",
  resourceType: "admin",
  skipBodyCapture: true,
})(postAdminLogoutHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/logout",
    tags: ["Auth"],
    summary: "Admin logout",
    responses: {
      ...genericErrors,
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({ success: z.boolean(), message: z.string().optional() }),
          },
        },
      },
    },
  });
}
