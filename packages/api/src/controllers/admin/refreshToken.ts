import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { refreshSessionWithToken } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

async function postAdminRefreshTokenHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  // Read and parse request body
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const Req = z.object({ refreshToken: z.string() });
  const { refreshToken } = Req.parse(raw);

  // Attempt to refresh the session
  const result = await refreshSessionWithToken(context, refreshToken);

  if (!result) {
    throw new ValidationError("Invalid or expired refresh token");
  }

  // Return new tokens
  sendJson(response, 200, {
    success: true,
    accessToken: result.sessionId,
    refreshToken: result.refreshToken,
  });
}

export const postAdminRefreshToken = withAudit({
  eventType: "ADMIN_REFRESH_TOKEN",
  resourceType: "admin",
})(postAdminRefreshTokenHandler);

export const schema = {
  method: "POST",
  path: "/admin/refresh-token",
  tags: ["Auth"],
  summary: "Refresh admin session",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: z.object({ refreshToken: z.string() }),
  },
  responses: {
    ...genericErrors,
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
        },
      },
    },
  },
} as const satisfies ControllerSchema;
