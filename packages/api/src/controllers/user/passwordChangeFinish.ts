import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { userPasswordChangeFinish } from "../../models/passwords.js";
import { requireOpaqueService } from "../../services/opaque.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function postUserPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireOpaqueService(context);

  const session = await requireSession(context, request, false);
  if (!session.sub || !session.email) {
    throw new ValidationError("Invalid user session");
  }
  const userSub = session.sub;

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const Req = z.object({
    record: z.string(),
    export_key_hash: z.string(),
    reauth_token: z.string(),
  });
  const parsed = Req.parse(raw);
  const record = parsed.record;
  const exportKeyHash = parsed.export_key_hash;

  let recordBuffer: Uint8Array;
  try {
    recordBuffer = fromBase64Url(record);
  } catch {
    throw new ValidationError("Invalid base64url encoding in record");
  }

  const reauthToken = parsed.reauth_token;
  const result = await userPasswordChangeFinish(context, {
    userSub,
    email: session.email,
    recordBuffer,
    exportKeyHash,
    reauthToken,
  });
  sendJson(response, 200, result);
}

export const postUserPasswordChangeFinish = withAudit({
  eventType: "USER_PASSWORD_CHANGE",
  resourceType: "user",
})(postUserPasswordChangeFinishHandler);

export const schema = {
  method: "POST",
  path: "/password/change/finish",
  tags: ["OPAQUE"],
  summary: "passwordChangeFinish",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
