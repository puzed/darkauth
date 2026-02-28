import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError } from "../../errors.ts";
import { rotateJwks as rotateJwksModel } from "../../models/jwks.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

async function rotateJwksHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole === "read") {
    throw new ForbiddenError("Write access required");
  }

  const { kid } = await rotateJwksModel(context);
  sendJson(response, 200, { kid, message: "JWKS rotated" });
}

export const rotateJwks = withAudit({
  eventType: "JWKS_ROTATE",
  resourceType: "jwks",
  skipBodyCapture: true,
})(rotateJwksHandler);

const Resp = z.object({ kid: z.string(), message: z.string() });

export const schema = {
  method: "POST",
  path: "/admin/jwks",
  tags: ["JWKS"],
  summary: "Rotate signing key",
  responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
} as const satisfies ControllerSchema;
