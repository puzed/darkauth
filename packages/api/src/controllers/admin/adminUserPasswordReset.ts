import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { adminUsers } from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postAdminUserPasswordResetHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) {
  const adminId = params[0];
  if (!adminId) {
    throw new ValidationError("Admin ID is required");
  }
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write permission required");
  }

  const admin = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, adminId),
  });
  if (!admin) {
    throw new NotFoundError("Admin user not found");
  }

  await context.db
    .update(adminUsers)
    .set({ passwordResetRequired: true })
    .where(eq(adminUsers.id, adminId));
  sendJson(response, 200, { success: true });
}

export const postAdminUserPasswordReset = withAudit({
  eventType: "ADMIN_PASSWORD_RESET_MARK",
  resourceType: "admin",
  extractResourceId: (_body, params) => params[0],
})(postAdminUserPasswordResetHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/admin-users/{adminId}/password-reset",
    tags: ["Admin Users"],
    summary: "Mark admin user for password reset",
    request: {
      params: z.object({
        adminId: z.string(),
      }),
    },
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
  });
}
