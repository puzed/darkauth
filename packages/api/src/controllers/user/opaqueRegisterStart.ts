import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { getSetting } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const postOpaqueRegisterStart = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  if (!context.services.opaque) {
    throw new ValidationError("OPAQUE service not available");
  }

  const enabled = (await getSetting(context, "users.self_registration_enabled")) as
    | boolean
    | undefined
    | null;
  if (!enabled) {
    throw new ForbiddenError("Self-registration disabled");
  }

  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const Req = z.object({
    request: z.string(),
    email: z.string().email().optional(),
    __debug: z.unknown().optional(),
  });
  const parsed = Req.safeParse(data);
  if (!parsed.success)
    throw new ValidationError("Missing or invalid request field", parsed.error.flatten());
  context.logger.debug(
    {
      rawLen: body?.length || 0,
      hasEmail: typeof parsed.data?.email === "string",
      debug: parsed.data?.__debug,
    },
    "[opaque] controller.registerStart"
  );

  let requestBuffer: Uint8Array;
  try {
    requestBuffer = fromBase64Url(parsed.data.request);
  } catch {
    throw new ValidationError("Invalid base64url encoding in request");
  }
  context.logger.debug(
    {
      len: requestBuffer.length,
      head: Buffer.from(requestBuffer).subarray(0, 16).toString("hex"),
    },
    "[opaque] controller.registerStart.decoded"
  );

  const registrationResponse = await context.services.opaque.startRegistration(
    requestBuffer,
    typeof parsed.data.email === "string" ? parsed.data.email : "",
    "DarkAuth"
  );

  const responseData = {
    message: toBase64Url(Buffer.from(registrationResponse.message)),
    serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
  };

  sendJson(response, 200, responseData);
};

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/opaque/register/start",
    tags: ["OPAQUE"],
    summary: "opaqueRegisterStart",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
