import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { signJWT } from "../../services/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, JWTPayload } from "../../types.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

export async function postUserPasswordVerifyFinish(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

    const session = await requireSession(context, request, false);
    if (!session.email || !session.sub) throw new ValidationError("Invalid user session");

    const body = await readBody(request);
    const data = parseJsonSafely(body) as {
      finish?: unknown;
      sessionId?: unknown;
    };
    if (!data.finish || typeof data.finish !== "string") {
      throw new ValidationError("Missing or invalid finish field");
    }
    if (!data.sessionId || typeof data.sessionId !== "string") {
      throw new ValidationError("Missing or invalid sessionId field");
    }

    let finishBuffer: Uint8Array;
    try {
      finishBuffer = fromBase64Url(data.finish as string);
    } catch {
      throw new ValidationError("Invalid base64url encoding in finish");
    }

    await context.services.opaque.finishLogin(finishBuffer, data.sessionId as string);

    const token = await signJWT(
      context,
      { sub: session.sub, purpose: "password_change" } as JWTPayload,
      "10m"
    );

    sendJson(response, 200, { reauth_token: token });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/password/change/verify/finish",
    tags: ["OPAQUE"],
    summary: "passwordChangeVerifyFinish",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
