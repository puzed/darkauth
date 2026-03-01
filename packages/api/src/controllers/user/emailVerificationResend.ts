import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { resendSignupVerificationByEmail } from "../../services/emailVerification.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

const BodySchema = z.object({ email: z.string().email() });

export const postEmailVerificationResend = withRateLimit("auth", (body) =>
  body && typeof body === "object" && "email" in body
    ? (body as { email?: string }).email
    : undefined
)(async (context: Context, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const body = await getCachedBody(request);
  const raw = parseJsonSafely(body);
  const parsed = BodySchema.parse(raw);

  await resendSignupVerificationByEmail(context, parsed.email.trim().toLowerCase());
  sendJson(response, 200, {
    success: true,
    message: "If your account is pending verification, a new email has been sent",
  });
});

export const schema = {
  method: "POST",
  path: "/email/verification/resend",
  tags: ["Users"],
  summary: "Resend verification email",
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
