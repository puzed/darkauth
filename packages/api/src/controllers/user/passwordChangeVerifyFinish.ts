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
    const raw = parseJsonSafely(body);
    const Req = z.object({ finish: z.string(), sessionId: z.string() });
    const parsed = Req.parse(raw);

    let finishBuffer: Uint8Array;
    try {
      finishBuffer = fromBase64Url(parsed.finish);
    } catch {
      throw new ValidationError("Invalid base64url encoding in finish");
    }

    await context.services.opaque.finishLogin(finishBuffer, parsed.sessionId);

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
