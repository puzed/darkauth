import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { otpConfigs } from "../../db/schema.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getOtpStatusModel } from "../../models/otp.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

export const getUserOtp = withAudit({ eventType: "ADMIN_USER_OTP_STATUS", resourceType: "user" })(
  async function getUserOtp(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    userSub: string
  ): Promise<void> {
    const session = await requireSession(context, request, true);
    if (session.adminRole !== "write" && session.adminRole !== "read") throw new Error("Forbidden");
    const status = await getOtpStatusModel(context, "user", userSub);
    const otpConfig = await context.db.query.otpConfigs.findFirst({
      where: and(eq(otpConfigs.cohort, "user"), eq(otpConfigs.subjectId, userSub)),
    });
    sendJson(response, 200, {
      enabled: status.enabled,
      pending: status.pending,
      verified: status.verified,
      created_at: status.createdAt || null,
      last_used_at: status.lastUsedAt || null,
      failure_count: otpConfig?.failureCount ?? 0,
      locked_until: otpConfig?.lockedUntil || null,
    });
  }
);

const UserOtpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  pending: z.boolean(),
  verified: z.boolean(),
  created_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  failure_count: z.number(),
  locked_until: z.string().nullable(),
});

export const schema = {
  method: "GET",
  path: "/admin/users/{userSub}/otp",
  tags: ["Users"],
  summary: "Get user OTP status",
  params: z.object({ userSub: z.string() }),
  responses: {
    200: {
      description: "OTP status",
      content: { "application/json": { schema: UserOtpStatusResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
