import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { refreshSessionWithToken } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

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

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/refresh-token",
    tags: ["Auth"],
    summary: "Refresh admin session",
    request: {
      body: { content: { "application/json": { schema: z.object({ refreshToken: z.string() }) } } },
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
  });
}
