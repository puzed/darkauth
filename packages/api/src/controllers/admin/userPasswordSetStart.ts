// Imports
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { startUserPasswordSetForAdmin } from "../../models/passwords.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

// Schemas
const PasswordSetStartRequestSchema = z.object({
  request: z.string(),
});

const PasswordSetStartResponseSchema = z.object({
  message: z.string(),
  serverPublicKey: z.string(),
  identityU: z.string(),
});

// Handler
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

    const body = await readBody(request);
    const data = parseJsonSafely(body) as Record<string, unknown>;
    if (!data.request || typeof data.request !== "string") {
      throw new ValidationError("Missing or invalid request field");
    }
    const requestBuffer = fromBase64Url(data.request as string);
    const { registrationResponse, identityU } = await startUserPasswordSetForAdmin(
      context,
      userSub,
      requestBuffer
    );

    sendJson(response, 200, {
      message: toBase64Url(Buffer.from(registrationResponse.message)),
      serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
      identityU,
    });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postUserPasswordSetStart = postUserPasswordSetStartHandler;

// OpenAPI schema
export const schema = {
  method: "POST",
  path: "/admin/users/{userSub}/password-set-start",
  tags: ["Users"],
  summary: "Start setting user password",
  params: z.object({
    userSub: z.string(),
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
