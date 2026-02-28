import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import { getSetting } from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

export const postOpaqueRegisterStart = withRateLimit("auth", (body) =>
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
    const opaque = await requireOpaqueService(context);

    const enabled = (await getSetting(context, "users.self_registration_enabled")) as
      | boolean
      | undefined
      | null;
    if (!enabled) {
      throw new ForbiddenError("Self-registration disabled");
    }

    const body = await getCachedBody(request);
    const data = parseJsonSafely(body);
    const Req = z.object({
      request: z.string(),
      email: z.string().email().optional(),
    });
    const parsed = Req.safeParse(data);
    if (!parsed.success)
      throw new ValidationError("Missing or invalid request field", parsed.error.flatten());
    context.logger.debug(
      {
        rawLen: body?.length || 0,
        hasEmail: typeof parsed.data?.email === "string",
      },
      "[opaque] controller.registerStart"
    );

    let requestBuffer: Uint8Array;
    try {
      requestBuffer = fromBase64Url(parsed.data.request);
    } catch {
      throw new ValidationError("Invalid base64url encoding in request");
    }
    context.logger.debug(
      {
        len: requestBuffer.length,
        head: Buffer.from(requestBuffer).subarray(0, 16).toString("hex"),
      },
      "[opaque] controller.registerStart.decoded"
    );

    const registrationResponse = await opaque.startRegistration(
      requestBuffer,
      typeof parsed.data.email === "string" ? parsed.data.email : "",
      "DarkAuth"
    );

    const responseData = {
      message: toBase64Url(Buffer.from(registrationResponse.message)),
      serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
    };

    sendJson(response, 200, responseData);
  }
);

export const schema = {
  method: "POST",
  path: "/opaque/register/start",
  tags: ["OPAQUE"],
  summary: "opaqueRegisterStart",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
