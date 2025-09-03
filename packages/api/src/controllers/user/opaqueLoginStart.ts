import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { opaqueRecords, users } from "../../db/schema.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../errors.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import type { Context } from "../../types.js";
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
    const data = parseJsonSafely(body) as {
      email?: unknown;
      request?: unknown;
    };
    context.logger.debug({ bodyLen: body?.length || 0 }, "parsed body");

    // Validate request format
    if (!data.email || typeof data.email !== "string") {
      throw new ValidationError("Missing or invalid email field");
    }

    if (!data.request || typeof data.request !== "string") {
      throw new ValidationError("Missing or invalid request field");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new ValidationError("Invalid email format");
    }

    let requestBuffer: Uint8Array;
    try {
      requestBuffer = fromBase64Url(data.request as string);
    } catch {
      throw new ValidationError("Invalid base64url encoding in request");
    }
    context.logger.debug({ reqLen: requestBuffer.length }, "decoded request");

    // Find user by email
    const user = await context.db.query.users.findFirst({
      where: eq(users.email, data.email as string),
      with: {
        opaqueRecord: true,
      },
    });
    context.logger.debug({ found: !!user }, "user lookup");

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.opaqueRecord) {
      throw new UnauthorizedError("User has no authentication record");
    }

    // Convert stored OPAQUE record to the expected format
    let envelopeBuffer = user.opaqueRecord.envelope as unknown as Buffer | string | null;
    let serverPubkeyBuffer = user.opaqueRecord.serverPubkey as unknown as Buffer | string | null;

    if (
      (envelopeBuffer
        ? typeof envelopeBuffer === "string"
          ? envelopeBuffer.length
          : (envelopeBuffer as Buffer).length
        : 0) === 0 ||
      (serverPubkeyBuffer
        ? typeof serverPubkeyBuffer === "string"
          ? serverPubkeyBuffer.length
          : (serverPubkeyBuffer as Buffer).length
        : 0) === 0
    ) {
      const rec = await context.db.query.opaqueRecords.findFirst({
        where: eq(opaqueRecords.sub, user.sub),
      });
      envelopeBuffer = rec?.envelope ?? envelopeBuffer;
      serverPubkeyBuffer = rec?.serverPubkey ?? serverPubkeyBuffer;
    }
    context.logger.debug(
      {
        envLen:
          typeof envelopeBuffer === "string"
            ? envelopeBuffer.length
            : (envelopeBuffer as Buffer)?.length || 0,
      },
      "opaque record lengths"
    );

    const envelopeBuf: Buffer =
      typeof envelopeBuffer === "string"
        ? Buffer.from((envelopeBuffer as string).replace(/^\\x/i, ""), "hex")
        : (envelopeBuffer as Buffer);
    const serverPubkeyBuf: Buffer =
      typeof serverPubkeyBuffer === "string"
        ? Buffer.from((serverPubkeyBuffer as string).replace(/^\\x/i, ""), "hex")
        : (serverPubkeyBuffer as Buffer);

    if (!envelopeBuf || !serverPubkeyBuf || envelopeBuf.length === 0) {
      throw new ValidationError("User OPAQUE record is incomplete");
    }

    const opaqueRecord = {
      envelope: new Uint8Array(envelopeBuf),
      serverPublicKey: new Uint8Array(serverPubkeyBuf),
    };

    // Call OPAQUE service to start login
    const loginResponse = await context.services.opaque.startLogin(
      requestBuffer,
      opaqueRecord,
      data.email as string // Pass the user's email as identityU
    );
    context.logger.debug({ sessionId: loginResponse.sessionId }, "opaque start ok");

    // Convert response to base64url for JSON transmission
    const responseData = {
      message: toBase64Url(Buffer.from(loginResponse.message)),
      sub: user.sub,
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
