import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { disableOtp } from "../../models/otp.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

export const deleteUserOtp = withAudit({
  eventType: "ADMIN_USER_OTP_DELETE",
  resourceType: "user",
})(async function deleteUserOtp(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new Error("Forbidden");
  await disableOtp(context, "user", userSub);
  sendJson(response, 200, { success: true });
});

const DeleteUserOtpResponseSchema = z.object({ success: z.boolean() });

export const schema = {
  method: "DELETE",
  path: "/admin/users/{userSub}/otp",
  tags: ["Users"],
  summary: "Disable user OTP",
  params: z.object({ userSub: z.string() }),
  responses: {
    200: {
      description: "OTP disabled",
      content: { "application/json": { schema: DeleteUserOtpResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
