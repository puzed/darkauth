import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { setAdminPasswordResetRequired } from "../../models/adminUsers.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postAdminUserPasswordResetHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) {
  const Params = z.object({ adminId: z.string() });
  const { adminId } = Params.parse({ adminId: params[0] });
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write permission required");
  }

  const result = await setAdminPasswordResetRequired(context, adminId, true);
  sendJson(response, 200, result);
}

export const postAdminUserPasswordReset = withAudit({
  eventType: "ADMIN_PASSWORD_RESET_MARK",
  resourceType: "admin",
  extractResourceId: (_body, params) => params[0],
})(postAdminUserPasswordResetHandler);

export const schema = {
  method: "POST",
  path: "/admin/admin-users/{adminId}/password-reset",
  tags: ["Admin Users"],
  summary: "Mark admin user for password reset",
  params: z.object({
    adminId: z.string(),
  }),
  responses: {
    200: {
      description: "Admin user marked for password reset",
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
