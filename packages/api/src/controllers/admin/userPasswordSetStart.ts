import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const PasswordSetStartRequestSchema = z.object({
  request: z.string(),
});

const PasswordSetStartResponseSchema = z.object({
  message: z.string(),
  serverPublicKey: z.string(),
  identityU: z.string(),
});

async function postUserPasswordSetStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  try {
    if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
    const session = await requireSession(context, request, true);
    if (!session.adminRole) throw new ValidationError("Admin privileges required");

    const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
    if (!user || !user.email) throw new NotFoundError("User not found");

    const body = await readBody(request);
    const data = parseJsonSafely(body) as Record<string, unknown>;
    if (!data.request || typeof data.request !== "string") {
      throw new ValidationError("Missing or invalid request field");
    }
    const requestBuffer = fromBase64Url(data.request);
    const registrationResponse = await context.services.opaque.startRegistration(
      requestBuffer,
      user.email
    );

    sendJson(response, 200, {
      message: toBase64Url(Buffer.from(registrationResponse.message)),
      serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
      identityU: user.email,
    });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postUserPasswordSetStart = postUserPasswordSetStartHandler;

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/users/{userSub}/password-set-start",
    tags: ["Users"],
    summary: "Start setting user password",
    request: {
      params: z.object({
        userSub: z.string(),
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
