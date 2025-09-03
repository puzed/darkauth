import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { userEncryptionKeys } from "../../db/schema.js";
import { UnauthorizedError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export async function putWrappedEncPrivateJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  if (!data || typeof data !== "object") throw new ValidationError("invalid body");
  const wrapped = (data as { wrapped_enc_private_jwk?: unknown }).wrapped_enc_private_jwk;
  if (!wrapped || typeof wrapped !== "string")
    throw new ValidationError("wrapped_enc_private_jwk required");
  let buf: Buffer;
  try {
    buf = fromBase64Url(wrapped);
  } catch {
    throw new ValidationError("invalid base64url");
  }
  if (buf.length === 0) throw new ValidationError("empty payload");
  if (buf.length > 10240) throw new ValidationError("too large");
  const now = new Date();
  await context.db
    .insert(userEncryptionKeys)
    .values({ sub: sessionData.sub, encPublicJwk: {}, encPrivateJwkWrapped: buf, updatedAt: now })
    .onConflictDoUpdate({
      target: userEncryptionKeys.sub,
      set: { encPrivateJwkWrapped: buf, updatedAt: now },
    });
  sendJson(response, 200, { success: true });
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "put",
    path: "/crypto/wrapped-enc-priv",
    tags: ["Crypto"],
    summary: "wrappedEncPrivPut",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
