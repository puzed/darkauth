import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { NotFoundError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getAdminById } from "../../models/adminUsers.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const PasswordSetStartRequestSchema = z.object({
  request: z.string(),
});

const PasswordSetStartResponseSchema = z.object({
  message: z.string(),
  serverPublicKey: z.string(),
  identityU: z.string(),
});

async function postAdminUserPasswordSetStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  adminId: string
) {
  const opaque = await requireOpaqueService(context);
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ValidationError("Write permission required");

  const admin = await getAdminById(context, adminId);
  if (!admin) throw new NotFoundError("Admin user not found");

  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const parsed = PasswordSetStartRequestSchema.parse(data);
  const requestBuffer = fromBase64Url(parsed.request);
  const registrationResponse = await opaque.startRegistration(requestBuffer, admin.email);

  sendJson(response, 200, {
    message: toBase64Url(Buffer.from(registrationResponse.message)),
    serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
    identityU: admin.email,
  });
}

export const postAdminUserPasswordSetStart = postAdminUserPasswordSetStartHandler;

export const schema = {
  method: "POST",
  path: "/admin/admin-users/{adminId}/password-set-start",
  tags: ["Admin Users"],
  summary: "Start setting admin user password",
  params: z.object({
    adminId: z.string(),
  }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: PasswordSetStartRequestSchema,
  },
  responses: {
    200: {
      description: "Password set started",
      content: {
        "application/json": {
          schema: PasswordSetStartResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
