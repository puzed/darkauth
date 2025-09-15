import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { otpConfigs } from "../../db/schema.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

export const postUserOtpUnlock = withAudit({
  eventType: "ADMIN_USER_OTP_UNLOCK",
  resourceType: "user",
})(async function postUserOtpUnlock(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new Error("Forbidden");
  await context.db
    .update(otpConfigs)
    .set({ failureCount: 0, lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(otpConfigs.cohort, "user"), eq(otpConfigs.subjectId, userSub)));
  sendJson(response, 200, { success: true });
});
