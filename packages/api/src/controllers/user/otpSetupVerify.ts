import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpSetup } from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const postOtpSetupVerify = withAudit({
  eventType: "OTP_SETUP_VERIFY",
  resourceType: "user",
})(
  withRateLimit("otp_verify")(async function postOtpSetupVerify(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const body = await readBody(request);
    const raw = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const { code } = Req.parse(raw);
    const { backupCodes } = await verifyOtpSetup(context, "user", session.sub as string, code);
    const sid = getSessionIdFromAuthHeader(request);
    if (sid) await updateSession(context, sid, { ...session, otpVerified: true });
    sendJson(response, 200, { success: true, backup_codes: backupCodes });
  })
);

const UserOtpSetupVerifyRequestSchema = z.object({ code: z.string().min(1) });
const UserOtpSetupVerifyResponseSchema = z.object({
  success: z.boolean(),
  backup_codes: z.array(z.string()),
});

export const schema = {
  method: "POST",
  path: "/otp/setup/verify",
  tags: ["OTP"],
  summary: "Verify OTP setup",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UserOtpSetupVerifyRequestSchema,
  },
  responses: {
    200: {
      description: "OTP setup verified",
      content: { "application/json": { schema: UserOtpSetupVerifyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
