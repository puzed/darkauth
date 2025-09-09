import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getAdminByEmail } from "../../models/adminUsers.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendError, sendJson } from "../../utils/http.js";

const OpaqueLoginStartRequestSchema = z.object({
  email: z.string().email(),
  start: z.string(),
});

const OpaqueLoginStartResponseSchema = z.object({
  response: z.string(),
  sessionId: z.string(),
});

async function postAdminOpaqueLoginStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  try {
    context.logger.debug({ path: "/admin/opaque/login/start" }, "admin opaque login start");
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

    const body = await getCachedBody(request);
    const data = parseJsonSafely(body) as Record<string, unknown>;
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
    } catch (_err) {
      throw new ValidationError("Invalid base64url encoding in request");
    }
    context.logger.debug({ reqLen: requestBuffer.length }, "decoded request");

    // Find admin user by email (with one retry if a PG client was dropped)
    const adminUser = await getAdminByEmail(context, data.email as string);
    context.logger.info({ email: data.email, found: !!adminUser }, "admin user lookup");

    if (!adminUser) {
      throw new NotFoundError("Admin user not found");
    }

    const { getAdminOpaqueRecordByAdminId } = await import("../../models/adminPasswords.js");
    const opaque = await getAdminOpaqueRecordByAdminId(context, adminUser.id);
    context.logger.info(
      {
        adminId: adminUser.id,
        hasRecord: !!opaque,
        envLen: (opaque?.envelope as Buffer)?.length || 0,
      },
      "opaque record lookup"
    );

    if (!opaque) {
      throw new UnauthorizedError("Admin user has no authentication record");
    }

    // Convert stored OPAQUE record to the expected format
    const envelopeBuffer =
      typeof opaque.envelope === "string"
        ? Buffer.from((opaque.envelope as unknown as string).slice(2), "hex")
        : (opaque.envelope ?? Buffer.alloc(0));

    const serverPubkeyBuffer =
      typeof opaque.serverPubkey === "string"
        ? Buffer.from((opaque.serverPubkey as unknown as string).slice(2), "hex")
        : (opaque.serverPubkey ?? Buffer.alloc(0));

    const opaqueRecord = {
      envelope: new Uint8Array(envelopeBuffer),
      serverPublicKey: new Uint8Array(serverPubkeyBuffer),
    };

    // Call OPAQUE service to start login
    const loginResponse = await context.services.opaque.startLogin(
      requestBuffer,
      opaqueRecord,
      data.email as string // Pass the user's email as identityU
    );
    context.logger.debug({ sessionId: loginResponse.sessionId }, "opaque start response");

    // Convert response to base64url for JSON transmission
    // SECURITY: Do not include adminId in response - identity is bound server-side
    const responseData = {
      message: toBase64Url(Buffer.from(loginResponse.message)),
      sessionId: loginResponse.sessionId,
    };
    sendJson(response, 200, responseData);
  } catch (error) {
    context.logger.error({ err: error }, "admin opaque login start failed");
    sendError(response, error as Error);
  }
}

export const postAdminOpaqueLoginStart = withRateLimit("admin", (body) =>
  body && typeof body === "object" && "email" in body
    ? (body as { email?: string }).email
    : undefined
)(postAdminOpaqueLoginStartHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/opaque-login-start",
    tags: ["Admin Authentication"],
    summary: "Start OPAQUE admin login process",
    request: {
      body: {
        content: {
          "application/json": {
            schema: OpaqueLoginStartRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Login process started",
        content: {
          "application/json": {
            schema: OpaqueLoginStartResponseSchema,
          },
        },
      },
      ...genericErrors,
    },
  });
}
