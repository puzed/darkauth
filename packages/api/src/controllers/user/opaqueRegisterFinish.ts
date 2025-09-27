import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { userOpaqueRegisterFinish } from "../../models/registration.js";
import { getSetting } from "../../services/settings.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

export const postOpaqueRegisterFinish = withAudit({
  eventType: "USER_REGISTER",
  resourceType: "user",
  extractResourceId: (body) =>
    body && typeof body === "object" && "email" in body
      ? (body as { email?: string }).email
      : undefined,
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    try {
      if (!context.services.opaque) {
        throw new ValidationError("OPAQUE service not available");
      }

      const enabled = (await getSetting(context, "users.self_registration_enabled")) as
        | boolean
        | undefined
        | null;
      if (!enabled) {
        throw new ForbiddenError("Self-registration disabled");
      }

      // Read and parse request body
      const body = await readBody(request);
      const raw = parseJsonSafely(body);
      const Req = z.union([
        z.object({
          record: z.string(),
          email: z.string().email(),
          name: z.string(),
          __debug: z.unknown().optional(),
        }),
        z.object({
          message: z.string(),
          email: z.string().email(),
          name: z.string(),
          __debug: z.unknown().optional(),
        }),
      ]);
      const parsed = Req.parse(raw);
      const recordBase64 = "record" in parsed ? parsed.record : parsed.message;
      const email = parsed.email;
      const name = parsed.name;

      let recordBuffer: Uint8Array;
      try {
        recordBuffer = fromBase64Url(recordBase64);
      } catch {
        throw new ValidationError("Invalid base64url encoding in record");
      }

      const result = await userOpaqueRegisterFinish(context, { record: recordBuffer, email, name });
      sendJson(response, 201, { ...result, message: "User registered successfully" });
    } catch (error) {
      sendError(response, error as Error);
    }
  }
);

export const schema = {
  method: "POST",
  path: "/opaque/register/finish",
  tags: ["OPAQUE"],
  summary: "opaqueRegisterFinish",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
