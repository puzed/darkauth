import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getUserOpaqueRecordHistoryByEmail } from "../../models/users.js";
import { requireOpaqueService } from "../../services/opaque.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema, OpaqueLoginResponse } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendJson } from "../../utils/http.js";

async function postUserPasswordRecoveryVerifyStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const opaque = await requireOpaqueService(context);

  const session = await requireSession(context, request, false);
  if (!session.email) throw new ValidationError("Email not available for session");

  const body = await getCachedBody(request);
  const data = parseJsonSafely(body);
  const Req = z.object({ request: z.string() });
  const parsed = Req.safeParse(data);
  if (!parsed.success)
    throw new ValidationError("Missing or invalid request field", parsed.error.flatten());

  let requestBuffer: Uint8Array;
  try {
    requestBuffer = fromBase64Url(parsed.data.request);
  } catch {
    throw new ValidationError("Invalid base64url encoding in request");
  }

  const { user, envelope, serverPubkey } = await getUserOpaqueRecordHistoryByEmail(
    context,
    session.email
  );
  if (!user || !envelope || !serverPubkey) {
    throw new ValidationError("User has no authentication history");
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
    throw new ValidationError("User has no authentication history");
  }

  let loginResponse: OpaqueLoginResponse;
  try {
    loginResponse = await opaque.startLogin(
      requestBuffer,
      {
        envelope: new Uint8Array(envelopeBuf),
        serverPublicKey: new Uint8Array(serverPubkeyBuf),
      },
      session.email
    );
  } catch (err) {
    context.logger.error(
      {
        path: "/password/recovery/verify/start",
        email: session.email,
        error: (err as Error)?.message,
      },
      "password recovery verify start failed"
    );
    throw new ValidationError("User has no authentication history");
  }

  sendJson(response, 200, {
    message: toBase64Url(Buffer.from(loginResponse.message)),
    sessionId: loginResponse.sessionId,
  });
}

export const postUserPasswordRecoveryVerifyStart = withRateLimit("opaque")(
  postUserPasswordRecoveryVerifyStartHandler
);

export const schema = {
  method: "POST",
  path: "/password/recovery/verify/start",
  tags: ["OPAQUE"],
  summary: "passwordRecoveryVerifyStart",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
