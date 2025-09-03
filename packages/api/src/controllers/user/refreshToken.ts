import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import {
  getSessionTtlSeconds,
  refreshSessionWithToken,
  setSessionCookie,
} from "../../services/sessions.js";
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
  const data = parseJsonSafely(body) as {
    refreshToken?: unknown;
  };
  if (!data.refreshToken || typeof data.refreshToken !== "string") {
    throw new ValidationError("Missing or invalid refreshToken field");
  }
  const result = await refreshSessionWithToken(context, data.refreshToken);
  if (!result) {
    throw new ValidationError("Invalid or expired refresh token");
  }
  const ttl = await getSessionTtlSeconds(context, "user");
  setSessionCookie(response, result.sessionId, false, context.config.isDevelopment, ttl);
  sendJson(response, 200, {
    success: true,
    sessionId: result.sessionId,
    refreshToken: result.refreshToken,
  });
}

export const postUserRefreshToken = withAudit({
  eventType: "USER_REFRESH_TOKEN",
  resourceType: "user",
})(postUserRefreshTokenHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ refreshToken: z.string() });
  const Resp = z.object({ success: z.boolean(), sessionId: z.string(), refreshToken: z.string() });
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
