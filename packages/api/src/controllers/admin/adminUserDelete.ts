import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { deleteAdminUser } from "../../models/adminUsers.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

export async function deleteAdminUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  adminId: string
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }
  if (sessionData.adminId === adminId) {
    throw new ForbiddenError("Cannot delete your own admin account");
  }
  const result = await deleteAdminUser(context, adminId);
  sendJson(response, 200, result);
}

export const schema = {
  method: "DELETE",
  path: "/admin/admin-users/{adminId}",
  tags: ["Admin Users"],
  summary: "Delete admin user",
  params: z.object({ adminId: z.string().uuid() }),
  responses: {
    ...genericErrors,
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ message: z.string() }) } },
    },
  },
} as const satisfies ControllerSchema;
