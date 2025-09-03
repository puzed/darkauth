import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function postUserPasswordChangeStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (!context.services.opaque) {
    throw new ValidationError("OPAQUE service not available");
  }

  const session = await requireSession(context, request, false);
  const email = session.email;
  if (!email) {
    throw new ValidationError("Email not available for session");
  }

  const body = await readBody(request);
  const data = parseJsonSafely(body) as {
    request?: unknown;
  };
  if (!data.request || typeof data.request !== "string") {
    throw new ValidationError("Missing or invalid request field");
  }
  let requestBuffer: Uint8Array;
  try {
    requestBuffer = fromBase64Url(data.request as string);
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

export const postUserPasswordChangeStart = postUserPasswordChangeStartHandler;

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/password/change/start",
    tags: ["OPAQUE"],
    summary: "passwordChangeStart",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
