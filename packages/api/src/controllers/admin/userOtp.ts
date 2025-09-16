import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { otpConfigs } from "../../db/schema.js";
import { getOtpStatusModel } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

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
    const cfg = await context.db.query.otpConfigs.findFirst({
      where: and(eq(otpConfigs.cohort, "user"), eq(otpConfigs.subjectId, userSub)),
    });
    sendJson(response, 200, {
      enabled: status.enabled,
      pending: status.pending,
      verified: status.verified,
      created_at: status.createdAt || null,
      last_used_at: status.lastUsedAt || null,
      failure_count: cfg?.failureCount ?? 0,
      locked_until: cfg?.lockedUntil || null,
    });
  }
);
