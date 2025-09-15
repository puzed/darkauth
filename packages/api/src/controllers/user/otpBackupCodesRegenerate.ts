import type { IncomingMessage, ServerResponse } from "node:http";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { regenerateBackupCodes } from "../../models/otp.js";
import { verifyJWT } from "../../services/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const postOtpBackupCodesRegenerate = withAudit({
  eventType: "OTP_BACKUP_REGENERATE",
  resourceType: "user",
})(
  withRateLimit("otp_regenerate")(async function postOtpBackupCodesRegenerate(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const body = await readBody(request);
    const data = parseJsonSafely(body) as { reauth_token?: string };
    if (!data?.reauth_token) return sendJson(response, 400, { error: "reauth_token required" });
    try {
      const payload = (await verifyJWT(context, data.reauth_token)) as import("jose").JWTPayload;
      const purpose = (payload as Record<string, unknown>).purpose;
      if (payload.sub !== session.sub || purpose !== "password_change")
        return sendJson(response, 400, { error: "Invalid reauthentication token" });
    } catch {
      return sendJson(response, 400, { error: "Invalid reauthentication token" });
    }
    const { backupCodes } = await regenerateBackupCodes(context, "user", session.sub as string);
    sendJson(response, 200, { backup_codes: backupCodes });
  })
);
