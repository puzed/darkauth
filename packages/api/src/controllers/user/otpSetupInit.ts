import type { IncomingMessage, ServerResponse } from "node:http";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { initOtp } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

export const postOtpSetupInit = withAudit({ eventType: "OTP_SETUP_INIT", resourceType: "user" })(
  withRateLimit("otp_setup")(async function postOtpSetupInit(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const { secret, provisioningUri } = await initOtp(context, "user", session.sub as string);
    sendJson(response, 200, { secret, provisioning_uri: provisioningUri });
  })
);
