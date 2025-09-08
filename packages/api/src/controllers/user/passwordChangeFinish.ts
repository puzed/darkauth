import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { userPasswordChangeFinish } from "../../models/passwords.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function postUserPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (!context.services.opaque) {
    throw new ValidationError("OPAQUE service not available");
  }

  const session = await requireSession(context, request, false);
  if (!session.sub || !session.email) {
    throw new ValidationError("Invalid user session");
  }
  const userSub = session.sub;

  const body = await readBody(request);
  const data = parseJsonSafely(body) as {
    record?: unknown;
    export_key_hash?: unknown;
    reauth_token?: unknown;
  };
  if (!data.record || typeof data.record !== "string") {
    throw new ValidationError("Missing or invalid record field");
  }
  if (!data.export_key_hash || typeof data.export_key_hash !== "string") {
    throw new ValidationError("Missing or invalid export_key_hash field");
  }

  // At this point, we know these fields are strings
  const record = data.record as string;
  const exportKeyHash = data.export_key_hash as string;

  let recordBuffer: Uint8Array;
  try {
    recordBuffer = fromBase64Url(record);
  } catch {
    throw new ValidationError("Invalid base64url encoding in record");
  }

  if (!data.reauth_token || typeof data.reauth_token !== "string") {
    throw new ValidationError("Reauthentication required");
  }

  const reauthToken = data.reauth_token as string;
  const result = await userPasswordChangeFinish(context, {
    userSub,
    email: session.email,
    recordBuffer,
    exportKeyHash,
    reauthToken,
  });
  sendJson(response, 200, result);
}

export const postUserPasswordChangeFinish = withAudit({
  eventType: "USER_PASSWORD_CHANGE",
  resourceType: "user",
})(postUserPasswordChangeFinishHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/password/change/finish",
    tags: ["OPAQUE"],
    summary: "passwordChangeFinish",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
