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

async function postUserRefreshTokenHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
) {
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const Req = z.object({ refreshToken: z.string() });
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ refreshToken: z.string() });
  const Resp = z.object({
    success: z.boolean(),
    accessToken: z.string(),
    refreshToken: z.string(),
  });
  registry.registerPath({
    method: "post",
    path: "/refresh-token",
    tags: ["Auth"],
    summary: "Refresh user session",
    request: { body: { content: { "application/json": { schema: Req } } } },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
