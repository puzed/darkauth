import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getAdminByEmail } from "../../models/adminUsers.js";
import { requireOpaqueService } from "../../services/opaque.js";
import type { Context, ControllerSchema, OpaqueLoginResponse } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendError, sendJson } from "../../utils/http.js";

const OpaqueLoginStartRequestSchema = z
  .object({
    email: z.string().email(),
    start: z.string().optional(),
    request: z.string().optional(),
  })
  .refine((data) => typeof data.start === "string" || typeof data.request === "string", {
    message: "Missing request payload",
    path: ["request"],
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
    const opaqueService = await requireOpaqueService(context);

    const body = await getCachedBody(request);
    const parsed = OpaqueLoginStartRequestSchema.parse(parseJsonSafely(body));
    context.logger.debug({ bodyLen: body?.length || 0 }, "parsed body");

    let requestBuffer: Uint8Array;
    try {
      const payload = parsed.start ?? parsed.request;
      requestBuffer = fromBase64Url(payload as string);
    } catch (_err) {
      throw new ValidationError("Invalid base64url encoding in request payload");
    }
    context.logger.debug({ reqLen: requestBuffer.length }, "decoded request");

    // Find admin user by email (with one retry if a PG client was dropped)
    const adminUser = await getAdminByEmail(context, parsed.email);
    context.logger.info({ email: parsed.email, found: !!adminUser }, "admin user lookup");

    let loginResponse: OpaqueLoginResponse;
    if (!adminUser) {
      loginResponse = await opaqueService.startLoginWithDummy(requestBuffer, parsed.email);
    } else {
      const { getAdminOpaqueRecordByAdminId } = await import("../../models/adminPasswords.js");
      const opaqueRecordRow = await getAdminOpaqueRecordByAdminId(context, adminUser.id);
      const envelopeBuffer =
        typeof opaqueRecordRow?.envelope === "string"
          ? Buffer.from((opaqueRecordRow?.envelope as unknown as string).slice(2), "hex")
          : (opaqueRecordRow?.envelope ?? Buffer.alloc(0));
      const serverPubkeyBuffer =
        typeof opaqueRecordRow?.serverPubkey === "string"
          ? Buffer.from((opaqueRecordRow?.serverPubkey as unknown as string).slice(2), "hex")
          : (opaqueRecordRow?.serverPubkey ?? Buffer.alloc(0));

      if (!opaqueRecordRow || envelopeBuffer.length === 0 || serverPubkeyBuffer.length === 0) {
        loginResponse = await opaqueService.startLoginWithDummy(requestBuffer, parsed.email);
      } else {
        const opaqueRecord = {
          envelope: new Uint8Array(envelopeBuffer),
          serverPublicKey: new Uint8Array(serverPubkeyBuffer),
        };
        loginResponse = await opaqueService.startLogin(requestBuffer, opaqueRecord, parsed.email);
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
