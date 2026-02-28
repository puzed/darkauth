import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { getUserOpaqueRecordByEmail } from "../../models/users.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import type { Context, ControllerSchema, OpaqueLoginResponse } from "../../types.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

export const schema = {
  method: "POST",
  path: "/opaque/login/start",
  tags: ["OPAQUE"],
  summary: "opaqueLoginStart",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;

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
    const opaque = await requireOpaqueService(context);

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
      loginResponse = await opaque.startLoginWithDummy(requestBuffer, parsed.email);
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
        loginResponse = await opaque.startLoginWithDummy(requestBuffer, parsed.email);
      } else {
        const opaqueRecord = {
          envelope: new Uint8Array(envelopeBuf),
          serverPublicKey: new Uint8Array(serverPubkeyBuf),
        };
        loginResponse = await opaque.startLogin(requestBuffer, opaqueRecord, parsed.email);
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
