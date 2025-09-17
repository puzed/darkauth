import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

const PasswordChangeStartRequestSchema = z.object({
  request: z.string(),
});

const PasswordChangeStartResponseSchema = z.object({
  message: z.string(),
  serverPublicKey: z.string(),
  identityU: z.string(),
});

async function postAdminPasswordChangeStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!context.services.opaque) {
    throw new ValidationError("OPAQUE service not available");
  }

  const session = await requireSession(context, request, true);
  const email = session.email;
  if (!email) {
    throw new ValidationError("Email not available for session");
  }

  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const parsed = PasswordChangeStartRequestSchema.safeParse(data);
  if (!parsed.success)
    throw new ValidationError(
      "Invalid request format. Expected request field.",
      parsed.error.flatten()
    );
  let requestBuffer: Uint8Array;
  try {
    requestBuffer = fromBase64Url(parsed.data.request);
  } catch {
    throw new ValidationError("Invalid base64url encoding in request");
  }

  const registrationResponse = await context.services.opaque.startRegistration(
    requestBuffer,
    email
  );

  sendJson(response, 200, {
    message: toBase64Url(Buffer.from(registrationResponse.message)),
    serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
    identityU: email,
  });
}

export const postAdminPasswordChangeStart = postAdminPasswordChangeStartHandler;

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/password-change-start",
    tags: ["Admin Authentication"],
    summary: "Start admin password change process",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PasswordChangeStartRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Password change process started",
        content: {
          "application/json": {
            schema: PasswordChangeStartResponseSchema,
          },
        },
      },
      ...genericErrors,
    },
  });
}
