import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpCode } from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

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
    const sessionId = getSessionIdFromAuthHeader(request);
    if (!sessionId) {
      sendJson(response, 401, { error: "No session token" });
      return;
    }
    await verifyOtpCode(context, "user", session.sub as string, code);
    await updateSession(context, sessionId, { ...session, otpVerified: true });
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
