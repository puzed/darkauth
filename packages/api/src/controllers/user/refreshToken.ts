import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { refreshSessionWithToken } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

// Define request and response schemas
const Req = z.object({ refreshToken: z.string() });
const Resp = z.object({
  success: z.boolean(),
  accessToken: z.string(),
  refreshToken: z.string(),
});

async function postUserRefreshTokenHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
) {
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const parsed = Req.safeParse(data);
  if (!parsed.success)
    throw new ValidationError("Missing or invalid refreshToken field", parsed.error.flatten());
  const result = await refreshSessionWithToken(context, parsed.data.refreshToken);
  if (!result) {
    throw new ValidationError("Invalid or expired refresh token");
  }
  sendJson(response, 200, {
    success: true,
    accessToken: result.sessionId,
    refreshToken: result.refreshToken,
  });
}

export const postUserRefreshToken = withAudit({
  eventType: "USER_REFRESH_TOKEN",
  resourceType: "user",
})(postUserRefreshTokenHandler);

// OpenAPI schema definition
export const schema = {
  method: "POST",
  path: "/refresh-token",
  tags: ["Auth"],
  summary: "Refresh user session",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
