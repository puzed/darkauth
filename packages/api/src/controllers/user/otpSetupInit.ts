import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { initOtp } from "../../models/otp.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

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
