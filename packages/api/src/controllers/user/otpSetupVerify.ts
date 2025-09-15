import type { IncomingMessage, ServerResponse } from "node:http";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpSetup } from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context } from "../../types.js";
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
    const data = parseJsonSafely(body) as { code?: string };
    const code = typeof data.code === "string" ? data.code.trim() : "";
    if (!code) return sendJson(response, 400, { error: "Invalid OTP code" });
    const { backupCodes } = await verifyOtpSetup(context, "user", session.sub as string, code);
    const sid = getSessionIdFromAuthHeader(request);
    if (sid) await updateSession(context, sid, { ...session, otpVerified: true });
    sendJson(response, 200, { success: true, backup_codes: backupCodes });
  })
);
