import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getAdminById } from "../../models/adminUsers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

interface PasswordSetStartRequest {
  request: string;
}

function isPasswordSetStartRequest(data: unknown): data is PasswordSetStartRequest {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.request === "string";
}

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
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ValidationError("Write permission required");

  const admin = await getAdminById(context, adminId);
  if (!admin) throw new NotFoundError("Admin user not found");

  const body = await readBody(request);
  const data = parseJsonSafely(body);

  if (!isPasswordSetStartRequest(data)) {
    throw new ValidationError("Invalid request format. Expected request field.");
  }
  const requestBuffer = fromBase64Url(data.request);
  const registrationResponse = await context.services.opaque.startRegistration(
    requestBuffer,
    admin.email
  );

  sendJson(response, 200, {
    message: toBase64Url(Buffer.from(registrationResponse.message)),
    serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
    identityU: admin.email,
  });
}

export const postAdminUserPasswordSetStart = postAdminUserPasswordSetStartHandler;

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/admin-users/{adminId}/password-set-start",
    tags: ["Admin Users"],
    summary: "Start setting admin user password",
    request: {
      params: z.object({
        adminId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: PasswordSetStartRequestSchema,
          },
        },
      },
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
  });
}
