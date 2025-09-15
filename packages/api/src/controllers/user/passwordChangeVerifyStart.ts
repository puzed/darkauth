import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { getUserOpaqueRecordByEmail } from "../../models/users.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, OpaqueLoginResponse } from "../../types.js";
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

    const { user, envelope, serverPubkey } = await getUserOpaqueRecordByEmail(
      context,
      session.email
    );
    if (!user || !envelope || !serverPubkey) {
      throw new ValidationError("User has no authentication record");
    }
    const envelopeBuf: Buffer =
      typeof envelope === "string"
        ? Buffer.from((envelope as string).replace(/^\\x/i, ""), "hex")
        : (envelope as Buffer);
    const serverPubkeyBuf: Buffer =
      typeof serverPubkey === "string"
        ? Buffer.from((serverPubkey as string).replace(/^\\x/i, ""), "hex")
        : (serverPubkey as Buffer);

    if (
      !envelopeBuf ||
      envelopeBuf.length === 0 ||
      !serverPubkeyBuf ||
      serverPubkeyBuf.length === 0
    ) {
      throw new ValidationError("User has no authentication record");
    }

    try {
      context.logger.debug(
        {
          path: "/password/change/verify/start",
          envelopeLen: envelopeBuf.length,
          serverPubkeyLen: serverPubkeyBuf.length,
          email: session.email,
        },
        "password verify start pre"
      );
    } catch {}

    let loginResponse: OpaqueLoginResponse;
    try {
      loginResponse = await context.services.opaque.startLogin(
        requestBuffer,
        {
          envelope: new Uint8Array(envelopeBuf),
          serverPublicKey: new Uint8Array(serverPubkeyBuf),
        },
        session.email
      );
    } catch (err) {
      try {
        context.logger.error(
          {
            path: "/password/change/verify/start",
            email: session.email,
            error: (err as Error)?.message,
          },
          "password verify start failed"
        );
      } catch {}
      throw new ValidationError("User has no authentication record");
    }

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
