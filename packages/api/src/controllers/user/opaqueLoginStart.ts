import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ValidationError } from "../../errors.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getUserOpaqueRecordByEmail } from "../../models/users.js";
import type { Context, OpaqueLoginResponse } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendJson } from "../../utils/http.js";

export const postOpaqueLoginStart = withRateLimit("opaque", (body) =>
  body && typeof body === "object" && "email" in body
    ? (body as { email?: string }).email
    : undefined
)(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    context.logger.debug({ path: "/opaque/login/start" }, "user opaque login start");
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

    // Read and parse request body (may be cached by rate limit middleware)
    const body = await getCachedBody(request);
    const data = parseJsonSafely(body);
    context.logger.debug({ bodyLen: body?.length || 0 }, "parsed body");

    // Validate request format
    const Req = z.object({ email: z.string().email(), request: z.string() });
    const parsed = Req.parse(data);

    let requestBuffer: Uint8Array;
    try {
      requestBuffer = fromBase64Url(parsed.request);
    } catch {
      throw new ValidationError("Invalid base64url encoding in request");
    }
    context.logger.debug({ reqLen: requestBuffer.length }, "decoded request");

    const userLookup = await getUserOpaqueRecordByEmail(context, parsed.email);
    context.logger.debug({ found: !!userLookup.user }, "user lookup");

    let loginResponse: OpaqueLoginResponse;
    if (!userLookup.user) {
      loginResponse = await context.services.opaque.startLoginWithDummy(
        requestBuffer,
        parsed.email
      );
    } else {
      const envelopeBuffer = userLookup.envelope as unknown as Buffer | string | null;
      const serverPubkeyBuffer = userLookup.serverPubkey as unknown as Buffer | string | null;
      const envelopeBuf: Buffer =
        typeof envelopeBuffer === "string"
          ? Buffer.from((envelopeBuffer as string).replace(/^\\x/i, ""), "hex")
          : (envelopeBuffer as Buffer);
      const serverPubkeyBuf: Buffer =
        typeof serverPubkeyBuffer === "string"
          ? Buffer.from((serverPubkeyBuffer as string).replace(/^\\x/i, ""), "hex")
          : (serverPubkeyBuffer as Buffer);

      if (!envelopeBuf || !serverPubkeyBuf || envelopeBuf.length === 0) {
        loginResponse = await context.services.opaque.startLoginWithDummy(
          requestBuffer,
          parsed.email
        );
      } else {
        const opaqueRecord = {
          envelope: new Uint8Array(envelopeBuf),
          serverPublicKey: new Uint8Array(serverPubkeyBuf),
        };
        loginResponse = await context.services.opaque.startLogin(
          requestBuffer,
          opaqueRecord,
          parsed.email
        );
      }
    }
    context.logger.debug({ sessionId: loginResponse.sessionId }, "opaque start ok");

    // Convert response to base64url for JSON transmission
    const responseData = {
      message: toBase64Url(Buffer.from(loginResponse.message)),
      sub: "00000000-0000-0000-0000-000000000000",
      sessionId: loginResponse.sessionId,
    };

    sendJson(response, 200, responseData);
  }
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/opaque/login/start",
    tags: ["OPAQUE"],
    summary: "opaqueLoginStart",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
