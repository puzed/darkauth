import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { disableOtp, getOtpStatusModel } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  const status = await getOtpStatusModel(context, "admin", adminId);
  sendJson(response, 200, {
    enabled: status.enabled,
    pending: status.pending,
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
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  if (session.adminId === adminId) throw new Error("Cannot remove own OTP");
  await disableOtp(context, "admin", adminId);
  sendJson(response, 200, { success: true });
});

const AdminOtpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  pending: z.boolean(),
  verified: z.boolean(),
  created_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});

const AdminOtpDeleteResponseSchema = z.object({ success: z.boolean() });

export const getAdminUserOtpSchema = {
  method: "GET",
  path: "/admin/admin-users/{adminId}/otp",
  tags: ["Admin Users"],
  summary: "Get admin OTP status",
  params: z.object({ adminId: z.string() }),
  responses: {
    200: {
      description: "OTP status",
      content: { "application/json": { schema: AdminOtpStatusResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteAdminUserOtpSchema = {
  method: "DELETE",
  path: "/admin/admin-users/{adminId}/otp",
  tags: ["Admin Users"],
  summary: "Disable admin OTP",
  params: z.object({ adminId: z.string() }),
  responses: {
    200: {
      description: "OTP disabled",
      content: { "application/json": { schema: AdminOtpDeleteResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
