import type { IncomingMessage, ServerResponse } from "node:http";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpCode } from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context } from "../../types.js";
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
    const data = parseJsonSafely(body) as { code?: string };
    const code = typeof data.code === "string" ? data.code.trim() : "";
    if (!code) return sendJson(response, 400, { error: "Invalid OTP code" });
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
