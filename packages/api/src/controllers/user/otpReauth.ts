import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpCode } from "../../models/otp.js";
import { signJWT } from "../../services/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema, JWTPayload } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const postOtpReauth = withAudit({ eventType: "OTP_REAUTH", resourceType: "user" })(
  withRateLimit("otp_verify")(async function postOtpReauth(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const body = await readBody(request);
    const raw = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const { code } = Req.parse(raw);
    await verifyOtpCode(context, "user", session.sub as string, code);
    const token = await signJWT(
      context,
      { sub: session.sub, purpose: "password_change" } as JWTPayload,
      "10m"
    );
    sendJson(response, 200, { reauth_token: token });
  })
);

const OtpReauthRequestSchema = z.object({ code: z.string().min(1) });
const OtpReauthResponseSchema = z.object({ reauth_token: z.string() });

export const schema = {
  method: "POST",
  path: "/otp/reauth",
  tags: ["OTP"],
  summary: "Create OTP reauthentication token",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OtpReauthRequestSchema,
  },
  responses: {
    200: {
      description: "Reauthentication token",
      content: { "application/json": { schema: OtpReauthResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
