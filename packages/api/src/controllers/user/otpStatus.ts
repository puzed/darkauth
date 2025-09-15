import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { groups, userGroups } from "../../db/schema.js";
import { getOtpStatusModel } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

export const getOtpStatus = withAudit({ eventType: "OTP_STATUS", resourceType: "user" })(
  async function getOtpStatus(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const status = await getOtpStatusModel(context, "user", session.sub as string);
    let required = !!session.otpRequired;
    try {
      const s = await (await import("../../services/settings.js")).getSetting(context, "otp");
      if (
        s &&
        typeof s === "object" &&
        (s as { require_for_users?: boolean }).require_for_users === true
      )
        required = true;
    } catch {}
    if (!required) {
      try {
        const rows = await context.db
          .select({ groupKey: userGroups.groupKey })
          .from(userGroups)
          .innerJoin(groups, eq(userGroups.groupKey, groups.key))
          .where(
            and(
              eq(userGroups.userSub, session.sub as string),
              eq(groups.enableLogin, true),
              eq(groups.requireOtp, true)
            )
          )
          .limit(1);
        required = rows.length > 0;
      } catch {}
    }
    sendJson(response, 200, {
      enabled: status.enabled,
      verified: status.verified,
      created_at: status.createdAt || null,
      last_used_at: status.lastUsedAt || null,
      backup_codes_remaining: status.backupCodesRemaining,
      required,
    });
  }
);
