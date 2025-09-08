import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { rotateJwks as rotateJwksModel } from "../../models/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function rotateJwksHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole === "read") {
    throw new Error("Write access required");
  }

  const { kid } = await rotateJwksModel(context);
  sendJson(response, 200, { kid, message: "JWKS rotated" });
}

export const rotateJwks = withAudit({
  eventType: "JWKS_ROTATE",
  resourceType: "jwks",
  skipBodyCapture: true,
})(rotateJwksHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({ kid: z.string(), message: z.string() });
  registry.registerPath({
    method: "post",
    path: "/admin/jwks",
    tags: ["JWKS"],
    summary: "Rotate signing key",
    responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
  });
}
