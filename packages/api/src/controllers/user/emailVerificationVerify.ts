import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { consumeVerificationTokenAndApply } from "../../services/emailVerification.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

const BodySchema = z.object({ token: z.string().min(1) });

export const postEmailVerificationVerify = withRateLimit("auth")(
  async (context: Context, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await getCachedBody(request);
    const raw = parseJsonSafely(body);
    const parsed = BodySchema.parse(raw);

    await consumeVerificationTokenAndApply(context, parsed.token);
    sendJson(response, 200, { success: true, message: "Email verification successful" });
  }
);

export const schema = {
  method: "POST",
  path: "/email/verification/verify",
  tags: ["Users"],
  summary: "Verify email using token",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: BodySchema,
  },
  responses: {
    200: { description: "OK" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
