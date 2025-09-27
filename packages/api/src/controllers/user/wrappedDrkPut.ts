import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { setWrappedDrk as setWrappedDrkModel } from "../../models/wrappedRootKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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
    const sessionData = await requireSession(context, request, false);

    if (!sessionData.sub) {
      throw new UnauthorizedError("User session required");
    }

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
    const parsed = Req.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Invalid request format", parsed.error.flatten());
    }
    const wrappedDrkBuffer = fromBase64Url(parsed.data.wrapped_drk);
    await setWrappedDrkModel(context, sessionData.sub, wrappedDrkBuffer);

    sendJson(response, 200, {
      success: true,
      message: "Wrapped DRK stored successfully",
    });
  }
);

export const schema = {
  method: "PUT",
  path: "/crypto/wrapped-drk",
  tags: ["Crypto"],
  summary: "wrappedDrkPut",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
