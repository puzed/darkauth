import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getOtpStatusModel } from "../../models/otp.ts";
import { getUserOrganizations } from "../../models/rbac.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

export const getOtpStatus = withAudit({ eventType: "OTP_STATUS", resourceType: "user" })(
  async function getOtpStatus(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const status = await getOtpStatusModel(context, "user", session.sub as string);
    const organizations = await getUserOrganizations(context, session.sub as string);
    const activeMemberships = organizations.filter((membership) => membership.status === "active");
    const required = activeMemberships.some((membership) => membership.forceOtp);
    sendJson(response, 200, {
      enabled: status.enabled,
      pending: status.pending,
      verified: status.verified,
      created_at: status.createdAt || null,
      last_used_at: status.lastUsedAt || null,
      backup_codes_remaining: status.backupCodesRemaining,
      required,
    });
  }
);

const UserOtpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  pending: z.boolean(),
  verified: z.boolean(),
  created_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  backup_codes_remaining: z.number(),
  required: z.boolean(),
});

export const schema = {
  method: "GET",
  path: "/otp/status",
  tags: ["OTP"],
  summary: "Get OTP status",
  responses: {
    200: {
      description: "OTP status",
      content: { "application/json": { schema: UserOtpStatusResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
