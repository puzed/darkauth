import type { IncomingMessage, ServerResponse } from "node:http";
import { disableOtp, getOtpStatusModel } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

export const getAdminUserOtp = withAudit({
  eventType: "ADMIN_ADMIN_OTP_STATUS",
  resourceType: "admin",
})(async function getAdminUserOtp(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  adminId: string
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new Error("Forbidden");
  const status = await getOtpStatusModel(context, "admin", adminId);
  sendJson(response, 200, {
    enabled: status.enabled,
    verified: status.verified,
    created_at: status.createdAt || null,
    last_used_at: status.lastUsedAt || null,
  });
});

export const deleteAdminUserOtp = withAudit({
  eventType: "ADMIN_ADMIN_OTP_DELETE",
  resourceType: "admin",
})(async function deleteAdminUserOtp(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  adminId: string
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new Error("Forbidden");
  if (session.adminId === adminId) throw new Error("Cannot remove own OTP");
  await disableOtp(context, "admin", adminId);
  sendJson(response, 200, { success: true });
});
