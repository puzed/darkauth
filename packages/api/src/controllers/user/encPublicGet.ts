import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { userEncryptionKeys } from "../../db/schema.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import { getSetting } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getEncPublicJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const sub = url.searchParams.get("sub");
  if (!sub) throw new ValidationError("sub is required");
  const setting = (await getSetting(context, "user_keys")) as {
    enc_public_visible_to_authenticated_users?: boolean;
  } | null;
  const allowOthers = setting?.enc_public_visible_to_authenticated_users === true;
  if (sub !== sessionData.sub && !allowOthers) throw new UnauthorizedError("Not allowed");
  const row = await context.db.query.userEncryptionKeys.findFirst({
    where: eq(userEncryptionKeys.sub, sub),
  });
  if (!row) throw new NotFoundError("Not found");
  sendJson(response, 200, { enc_public_jwk: row.encPublicJwk });
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/crypto/user-enc-pub",
    tags: ["Crypto"],
    summary: "encPublicGet",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
