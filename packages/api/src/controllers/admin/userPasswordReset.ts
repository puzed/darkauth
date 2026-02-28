import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { setUserPasswordResetRequired } from "../../models/users.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postUserPasswordResetHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ userSub: z.string() });
  const { userSub } = Params.parse({ userSub: params[0] });
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write permission required");
  }

  const result = await setUserPasswordResetRequired(context, userSub, true);
  sendJson(response, 200, result);
}

export const postUserPasswordReset = withAudit({
  eventType: "USER_PASSWORD_RESET_MARK",
  resourceType: "user",
  extractResourceId: (_body, params) => params[0],
})(postUserPasswordResetHandler);

export const schema = {
  method: "POST",
  path: "/admin/users/{userSub}/password-reset",
  tags: ["Users"],
  summary: "Mark user for password reset",
  params: z.object({
    userSub: z.string(),
  }),
  responses: {
    200: {
      description: "User marked for password reset",
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
