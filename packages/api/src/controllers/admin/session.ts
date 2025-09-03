import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { adminUsers } from "../../db/schema.js";
import { UnauthorizedError } from "../../errors.js";
export const AdminSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  adminId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["read", "write"]),
  passwordResetRequired: z.boolean(),
});

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

export async function getAdminSession(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const rawCookie = request.headers.cookie || "";
  const sessionData = await requireSession(context, request, true);
  try {
    context.logger.info(
      {
        event: "admin.session.read",
        cookie: rawCookie,
        adminId: sessionData.adminId,
        role: sessionData.adminRole,
      },
      "admin session read"
    );
  } catch {}
  if (!sessionData.adminId || !sessionData.adminRole) {
    throw new UnauthorizedError("Invalid admin session");
  }
  const admin = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, sessionData.adminId),
  });
  const resetRequired = !!admin?.passwordResetRequired;
  const responseData = {
    authenticated: true,
    adminId: sessionData.adminId,
    email: sessionData.email,
    name: sessionData.name,
    role: sessionData.adminRole,
    passwordResetRequired: resetRequired,
  };

  sendJsonValidated(response, 200, responseData, AdminSessionResponseSchema);
}

// export const openApiSchema = createRouteSpec({
//   method: "get",
//   path: "/admin/session",
//   tags: ["Admin Session"],
//   summary: "Get current admin session information",
//   responses: {
//     200: {
//       description: "OK",
//       content: {
//         "application/json": {
//           schema: AdminSessionResponseSchema,
//           example: {
//             authenticated: true,
//             adminId: "123e4567-e89b-12d3-a456-426614174000",
//             email: "admin@example.com",
//             name: "Admin User",
//             role: "write",
//             passwordResetRequired: false
//           , ...genericErrors },
//         },
//       },
//     },
//     401: {
//       description: "Unauthorized",
//       content: {
//         "application/json": {
//           schema: UnauthorizedResponseSchema,
//           example: {
//             error: "UNAUTHORIZED",
//             message: "Invalid admin session",
//             code: "UNAUTHORIZED"
//           },
//         },
//       },
//     },
//     500: {
//       description: "Internal Server Error",
//       content: {
//         "application/json": {
//           schema: ErrorResponseSchema,
//         },
//       },
//     },
//   },
// });
export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
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
  });
}
