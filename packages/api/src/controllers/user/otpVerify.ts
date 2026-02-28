import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { verifyOtpCode } from "../../models/otp.ts";
import {
  getSessionId,
  getSessionTtlSeconds,
  issueSessionCookies,
  requireSession,
  rotateSession,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

export const postOtpVerify = withAudit({ eventType: "OTP_VERIFY", resourceType: "user" })(
  withRateLimit("otp_verify")(async function postOtpVerify(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const body = await readBody(request);
    const raw = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const { code } = Req.parse(raw);
    const sessionId = getSessionId(request);
    if (!sessionId) {
      sendJson(response, 401, { error: "No session cookie" });
      return;
    }
    await verifyOtpCode(context, "user", session.sub as string, code);
    const rotated = await rotateSession(context, sessionId, { ...session, otpVerified: true });
    if (!rotated) {
      sendJson(response, 401, { error: "Invalid or expired session" });
      return;
    }
    const ttlSeconds = await getSessionTtlSeconds(context, "user");
    issueSessionCookies(response, rotated.sessionId, ttlSeconds);
    sendJson(response, 200, { success: true });
  })
);

const UserOtpVerifyRequestSchema = z.object({ code: z.string().min(1) });
const UserOtpVerifyResponseSchema = z.object({ success: z.boolean() });

export const schema = {
  method: "POST",
  path: "/otp/verify",
  tags: ["OTP"],
  summary: "Verify OTP",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UserOtpVerifyRequestSchema,
  },
  responses: {
    200: {
      description: "OTP verified",
      content: { "application/json": { schema: UserOtpVerifyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
