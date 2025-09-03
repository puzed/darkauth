import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

export async function postUserPasswordVerifyStart(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

    const session = await requireSession(context, request, false);
    if (!session.email) throw new ValidationError("Email not available for session");

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

    const user = await context.db.query.users.findFirst({
      where: eq(users.email, session.email),
      with: { opaqueRecord: true },
    });
    if (!user || !user.opaqueRecord) {
      throw new ValidationError("User has no authentication record");
    }

    const envelope = user.opaqueRecord.envelope;
    const serverPubkey = user.opaqueRecord.serverPubkey;

    if (!envelope || !serverPubkey) {
      throw new ValidationError("User OPAQUE record is incomplete");
    }

    const loginResponse = await context.services.opaque.startLogin(
      requestBuffer,
      { envelope: new Uint8Array(envelope), serverPublicKey: new Uint8Array(serverPubkey) },
      session.email
    );

    sendJson(response, 200, {
      message: toBase64Url(Buffer.from(loginResponse.message)),
      sessionId: loginResponse.sessionId,
    });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/password/change/verify/start",
    tags: ["OPAQUE"],
    summary: "passwordChangeVerifyStart",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
