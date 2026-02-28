import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";

import { clearSessionCookies, deleteSession, getSessionId } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

async function postAdminLogoutHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  const sessionId = getSessionId(request, true);

  if (sessionId) {
    await deleteSession(context, sessionId);
  }
  clearSessionCookies(response);

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

export const schema = {
  method: "POST",
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
} as const satisfies ControllerSchema;
