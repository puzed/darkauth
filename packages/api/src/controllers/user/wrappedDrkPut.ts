import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { UnauthorizedError, ValidationError } from "../../errors.js";
import { setWrappedDrk as setWrappedDrkModel } from "../../models/wrappedRootKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const putWrappedDrk = withAudit({
  eventType: "DRK_UPDATE",
  resourceType: "drk",
  extractResourceId: (body) =>
    body && typeof body === "object" && "user_sub" in body
      ? (body as { user_sub?: string }).user_sub
      : undefined,
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    try {
      // Require authenticated session
      const sessionData = await requireSession(context, request, false);

      if (!sessionData.sub) {
        throw new UnauthorizedError("User session required");
      }

      // Read and parse request body
      const body = await readBody(request);
      const raw = parseJsonSafely(body);
      const Req = z.object({
        wrapped_drk: z.string().refine((s) => {
          try {
            const b = fromBase64Url(s);
            return b.length > 0 && b.length <= 10240;
          } catch {
            return false;
          }
        }),
      });
      const parsed = Req.parse(raw);
      const wrappedDrkBuffer = fromBase64Url(parsed.wrapped_drk);
      await setWrappedDrkModel(context, sessionData.sub, wrappedDrkBuffer);

      // Return success response
      sendJson(response, 200, {
        success: true,
        message: "Wrapped DRK stored successfully",
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        sendJson(response, 401, { error: error.message });
      } else if (error instanceof ValidationError) {
        sendJson(response, 400, { error: error.message });
      } else {
        console.error("Error in putWrappedDrk:", error);
        sendJson(response, 500, { error: "Internal server error" });
      }
    }
  }
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "put",
    path: "/crypto/wrapped-drk",
    tags: ["Crypto"],
    summary: "wrappedDrkPut",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
