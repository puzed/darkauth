import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { initOtp } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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

const UserOtpSetupInitResponseSchema = z.object({
  secret: z.string(),
  provisioning_uri: z.string(),
});

export const schema = {
  method: "POST",
  path: "/otp/setup/init",
  tags: ["OTP"],
  summary: "Start OTP setup",
  responses: {
    200: {
      description: "OTP setup initialized",
      content: {
        "application/json": {
          schema: UserOtpSetupInitResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
