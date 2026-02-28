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
import { requirePasswordChangeIdentity } from "./passwordAuth.ts";

async function postUserPasswordVerifyStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const opaque = await requireOpaqueService(context);

  const identity = await requirePasswordChangeIdentity(context, request);
  const email = identity.email;

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

  const { user, envelope, serverPubkey } = await getUserOpaqueRecordByEmail(context, email);
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

  context.logger.debug(
    {
      path: "/password/change/verify/start",
      envelopeLen: envelopeBuf.length,
      serverPubkeyLen: serverPubkeyBuf.length,
      email,
    },
    "password verify start pre"
  );

  let loginResponse: OpaqueLoginResponse;
  try {
    loginResponse = await opaque.startLogin(
      requestBuffer,
      {
        envelope: new Uint8Array(envelopeBuf),
        serverPublicKey: new Uint8Array(serverPubkeyBuf),
      },
      email
    );
  } catch (err) {
    context.logger.error(
      {
        path: "/password/change/verify/start",
        email,
        error: (err as Error)?.message,
      },
      "password verify start failed"
    );
    throw new ValidationError("User has no authentication record");
  }

  sendJson(response, 200, {
    message: toBase64Url(Buffer.from(loginResponse.message)),
    sessionId: loginResponse.sessionId,
  });
}

export const postUserPasswordVerifyStart = withRateLimit("opaque")(
  postUserPasswordVerifyStartHandler
);

export const schema = {
  method: "POST",
  path: "/password/change/verify/start",
  tags: ["OPAQUE"],
  summary: "passwordChangeVerifyStart",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
