import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { disableOtp } from "../../models/otp.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

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
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
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
