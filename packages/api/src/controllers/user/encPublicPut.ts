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
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export async function putEncPublicJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  if (!data || typeof data !== "object") throw new ValidationError("invalid body");
  const encPublicJwk = (data as { enc_public_jwk?: unknown }).enc_public_jwk;
  if (!encPublicJwk || typeof encPublicJwk !== "object")
    throw new ValidationError("enc_public_jwk required");
  const now = new Date();
  await context.db
    .insert(userEncryptionKeys)
    .values({ sub: sessionData.sub, encPublicJwk, updatedAt: now })
    .onConflictDoUpdate({
      target: userEncryptionKeys.sub,
      set: { encPublicJwk, updatedAt: now },
    });
  sendJson(response, 200, { success: true });
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "put",
    path: "/crypto/enc-pub",
    tags: ["Crypto"],
    summary: "encPublicPut",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
