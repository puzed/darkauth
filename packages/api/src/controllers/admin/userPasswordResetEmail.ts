import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { sendAdminPasswordResetEmail } from "../../services/passwordReset.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { getClientIp, sendJson } from "../../utils/http.ts";

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

export async function postUserPasswordResetEmail(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ userSub: z.string() });
  const { userSub } = Params.parse({ userSub: params[0] });
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write" || !session.adminId) {
    throw new ForbiddenError("Write permission required");
  }

  const result = await sendAdminPasswordResetEmail(context, {
    userSub,
    adminId: session.adminId,
    ipAddress: getClientIp(request),
    userAgent:
      typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
  });
  sendJson(response, 200, result);
}

export const schema = {
  method: "POST",
  path: "/admin/users/{userSub}/password/reset-email",
  tags: ["Users"],
  summary: "Send user password reset email",
  params: z.object({
    userSub: z.string(),
  }),
  responses: {
    200: {
      description: "Password reset email sent",
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
