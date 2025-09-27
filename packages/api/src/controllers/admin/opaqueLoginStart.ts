import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getAdminByEmail } from "../../models/adminUsers.js";
import type { Context, ControllerSchema, OpaqueLoginResponse } from "../../types.js";
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

    let loginResponse: OpaqueLoginResponse;
    if (!adminUser) {
      loginResponse = await context.services.opaque.startLoginWithDummy(
        requestBuffer,
        data.email as string
      );
    } else {
      const { getAdminOpaqueRecordByAdminId } = await import("../../models/adminPasswords.js");
      const opaque = await getAdminOpaqueRecordByAdminId(context, adminUser.id);
      const envelopeBuffer =
        typeof opaque?.envelope === "string"
          ? Buffer.from((opaque?.envelope as unknown as string).slice(2), "hex")
          : (opaque?.envelope ?? Buffer.alloc(0));
      const serverPubkeyBuffer =
        typeof opaque?.serverPubkey === "string"
          ? Buffer.from((opaque?.serverPubkey as unknown as string).slice(2), "hex")
          : (opaque?.serverPubkey ?? Buffer.alloc(0));

      if (!opaque || envelopeBuffer.length === 0 || serverPubkeyBuffer.length === 0) {
        loginResponse = await context.services.opaque.startLoginWithDummy(
          requestBuffer,
          data.email as string
        );
      } else {
        const opaqueRecord = {
          envelope: new Uint8Array(envelopeBuffer),
          serverPublicKey: new Uint8Array(serverPubkeyBuffer),
        };
        loginResponse = await context.services.opaque.startLogin(
          requestBuffer,
          opaqueRecord,
          data.email as string
        );
      }
    }
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

export const postAdminOpaqueLoginStart = withRateLimit("opaque", (body) =>
  body && typeof body === "object" && "email" in body
    ? (body as { email?: string }).email
    : undefined
)(postAdminOpaqueLoginStartHandler);

export const schema = {
  method: "POST",
  path: "/admin/opaque-login-start",
  tags: ["Admin Authentication"],
  summary: "Start OPAQUE admin login process",
  body: {
    description: "",
    required: false,
    contentType: "application/json",
    schema: OpaqueLoginStartRequestSchema,
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
} as const satisfies ControllerSchema;
