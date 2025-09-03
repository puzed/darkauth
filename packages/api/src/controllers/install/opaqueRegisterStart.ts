import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ValidationError } from "../../errors.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const Req = z.object({
  token: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["read", "write"]).optional(),
  request: z.string(),
});

export async function postInstallOpaqueRegisterStart(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    context.logger.info("[install:opaque:start] Beginning OPAQUE registration start");

    if (!context.services.opaque) {
      context.logger.error("[install:opaque:start] OPAQUE service not available");
      throw new ValidationError("OPAQUE service not available");
    }

    const body = await readBody(request);
    context.logger.debug({ bodyLen: body.length }, "[install:opaque:start] Read request body");

    const data = Req.parse(parseJsonSafely(body));
    context.logger.info(
      { email: data.email, name: data.name },
      "[install:opaque:start] Parsed request"
    );

    if (!context.services.install?.token || data.token !== context.services.install.token) {
      context.logger.error("[install:opaque:start] Invalid install token");
      throw new ValidationError("Invalid install token");
    }

    const reqBuf = fromBase64Url(data.request);
    context.logger.debug(
      { reqLen: reqBuf.length },
      "[install:opaque:start] Decoded OPAQUE request"
    );

    const reg = await context.services.opaque.startRegistration(reqBuf, data.email);
    context.logger.info(
      { msgLen: reg.message.length, pubKeyLen: reg.serverPublicKey.length },
      "[install:opaque:start] OPAQUE registration started"
    );

    const responseData = {
      message: toBase64Url(Buffer.from(reg.message)),
      serverPublicKey: toBase64Url(Buffer.from(reg.serverPublicKey)),
    };

    context.logger.debug(
      { msgB64Len: responseData.message.length, pubKeyB64Len: responseData.serverPublicKey.length },
      "[install:opaque:start] Sending response"
    );

    sendJson(response, 200, responseData);
  } catch (err) {
    context.logger.error({ err }, "[install:opaque:start] Failed");
    sendError(response, err as Error);
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/install/opaque/start",
    tags: ["Installation"],
    summary: "Start OPAQUE registration for bootstrap admin",
    responses: { 200: { description: "OK" } },
  });
}
