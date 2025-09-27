import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import {
  disableOtp,
  getOtpStatusModel,
  initOtp,
  verifyOtpCode,
  verifyOtpSetup,
} from "../../models/otp.js";
import {
  getSessionIdFromAuthHeader,
  requireSession,
  updateSession,
} from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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

export const postAdminOtpDisable = withAudit({
  eventType: "ADMIN_OTP_DISABLE",
  resourceType: "admin",
})(
  withRateLimit("otp_verify")(async function postAdminOtpDisable(
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
    await verifyOtpCode(context, "admin", session.adminId as string, code);
    await disableOtp(context, "admin", session.adminId as string);
    const sid = getSessionIdFromAuthHeader(request);
    if (sid)
      await updateSession(context, sid, { ...session, otpRequired: false, otpVerified: false });
    sendJson(response, 200, { success: true });
  })
);

export const postAdminOtpReset = withAudit({
  eventType: "ADMIN_OTP_RESET",
  resourceType: "admin",
})(
  withRateLimit("otp_setup")(async function postAdminOtpReset(
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
    await verifyOtpCode(context, "admin", session.adminId as string, code);
    const { secret, provisioningUri } = await initOtp(context, "admin", session.adminId as string);
    const sid = getSessionIdFromAuthHeader(request);
    if (sid)
      await updateSession(context, sid, { ...session, otpRequired: true, otpVerified: false });
    sendJson(response, 200, { secret, provisioning_uri: provisioningUri });
  })
);

const AdminOtpStatusSchema = z.object({
  enabled: z.boolean(),
  pending: z.boolean(),
  verified: z.boolean(),
  createdAt: z.any().nullable(),
  lastUsedAt: z.any().nullable(),
  backupCodesRemaining: z.number(),
});

const OtpCodeSchema = z.object({ code: z.string().min(1) });

const OtpSetupResponseSchema = z.object({ secret: z.string(), provisioning_uri: z.string() });

const OtpVerifyResponseSchema = z.object({ success: z.boolean() });

const OtpVerifyWithCodesResponseSchema = z.object({
  success: z.boolean(),
  backup_codes: z.array(z.string()),
});

export const getAdminOtpStatusSchema = {
  method: "GET",
  path: "/admin/otp/status",
  tags: ["Auth"],
  summary: "Get admin OTP status",
  responses: {
    200: {
      description: "OTP status",
      content: { "application/json": { schema: AdminOtpStatusSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postAdminOtpSetupInitSchema = {
  method: "POST",
  path: "/admin/otp/setup/init",
  tags: ["Auth"],
  summary: "Start admin OTP setup",
  responses: {
    200: {
      description: "Setup initialized",
      content: { "application/json": { schema: OtpSetupResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postAdminOtpSetupVerifySchema = {
  method: "POST",
  path: "/admin/otp/setup/verify",
  tags: ["Auth"],
  summary: "Verify admin OTP setup",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OtpCodeSchema,
  },
  responses: {
    200: {
      description: "OTP setup verified",
      content: { "application/json": { schema: OtpVerifyWithCodesResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postAdminOtpVerifySchema = {
  method: "POST",
  path: "/admin/otp/verify",
  tags: ["Auth"],
  summary: "Verify admin OTP",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OtpCodeSchema,
  },
  responses: {
    200: {
      description: "OTP verified",
      content: { "application/json": { schema: OtpVerifyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postAdminOtpDisableSchema = {
  method: "POST",
  path: "/admin/otp/disable",
  tags: ["Auth"],
  summary: "Disable admin OTP",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OtpCodeSchema,
  },
  responses: {
    200: {
      description: "OTP disabled",
      content: { "application/json": { schema: OtpVerifyResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postAdminOtpResetSchema = {
  method: "POST",
  path: "/admin/otp/reset",
  tags: ["Auth"],
  summary: "Reset admin OTP",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OtpCodeSchema,
  },
  responses: {
    200: {
      description: "OTP reset",
      content: { "application/json": { schema: OtpSetupResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
