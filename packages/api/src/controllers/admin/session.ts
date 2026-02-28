import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
export const AdminSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  adminId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["read", "write"]),
  passwordResetRequired: z.boolean(),
  otpRequired: z.boolean().optional(),
  otpVerified: z.boolean().optional(),
});

import { getAdminById } from "../../models/adminUsers.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

export async function getAdminSession(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  try {
    context.logger.info(
      {
        event: "admin.session.read",
        adminId: sessionData.adminId,
        role: sessionData.adminRole,
      },
      "admin session read"
    );
  } catch {}
  if (!sessionData.adminId || !sessionData.adminRole) {
    throw new UnauthorizedError("Invalid admin session");
  }
  const admin = await getAdminById(context, sessionData.adminId);
  const resetRequired = !!admin?.passwordResetRequired;
  const responseData = {
    authenticated: true,
    adminId: sessionData.adminId,
    email: sessionData.email,
    name: sessionData.name,
    role: sessionData.adminRole,
    passwordResetRequired: resetRequired,
    otpRequired: !!sessionData.otpRequired,
    otpVerified: !!sessionData.otpVerified,
  };

  sendJsonValidated(response, 200, responseData, AdminSessionResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/session",
  tags: ["Session"],
  summary: "Get current admin session information",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: AdminSessionResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
