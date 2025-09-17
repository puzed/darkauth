import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { getOtpStatusModel, initOtp, verifyOtpCode, verifyOtpSetup } from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const getAdminOtpStatus = withAudit({
  eventType: "ADMIN_OTP_STATUS",
  resourceType: "admin",
})(
  withRateLimit("otp")(async function getAdminOtpStatus(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, true);
    const status = await getOtpStatusModel(context, "admin", session.adminId as string);
    sendJson(response, 200, status);
  })
);

export const postAdminOtpSetupInit = withAudit({
  eventType: "ADMIN_OTP_SETUP_INIT",
  resourceType: "admin",
})(
  withRateLimit("otp_setup")(async function postAdminOtpSetupInit(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, true);
    const { secret, provisioningUri } = await initOtp(context, "admin", session.adminId as string);
    sendJson(response, 200, { secret, provisioning_uri: provisioningUri });
  })
);

export const postAdminOtpSetupVerify = withAudit({
  eventType: "ADMIN_OTP_SETUP_VERIFY",
  resourceType: "admin",
})(
  withRateLimit("otp_verify")(async function postAdminOtpSetupVerify(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, true);
    const body = await readBody(request);
    const data = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const parsed = Req.safeParse(data);
    if (!parsed.success) return sendJson(response, 400, { error: "Invalid OTP code" });
    const code = parsed.data.code.trim();
    const { backupCodes } = await verifyOtpSetup(context, "admin", session.adminId as string, code);
    const sid = getSessionIdFromAuthHeader(request);
    if (sid) await updateSession(context, sid, { ...session, otpVerified: true });
    sendJson(response, 200, { success: true, backup_codes: backupCodes });
  })
);

export const postAdminOtpVerify = withAudit({
  eventType: "ADMIN_OTP_VERIFY",
  resourceType: "admin",
})(
  withRateLimit("otp_verify")(async function postAdminOtpVerify(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, true);
    const body = await readBody(request);
    const data = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const parsed = Req.safeParse(data);
    if (!parsed.success) return sendJson(response, 400, { error: "Invalid OTP code" });
    const code = parsed.data.code.trim();
    const sid = getSessionIdFromAuthHeader(request);
    if (!sid) return sendJson(response, 401, { error: "No session token" });
    await verifyOtpCode(context, "admin", session.adminId as string, code);
    await updateSession(context, sid, { ...session, otpVerified: true });
    sendJson(response, 200, { success: true });
  })
);
