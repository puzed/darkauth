import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { userPasswordChangeFinish } from "../../models/passwords.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";
import { requirePasswordChangeIdentity } from "./passwordAuth.ts";

async function postUserPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireOpaqueService(context);

  const identity = await requirePasswordChangeIdentity(context, request);
  const userSub = identity.sub;

  const body = await getCachedBody(request);
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
    email: identity.email,
    recordBuffer,
    exportKeyHash,
    reauthToken,
  });
  sendJson(response, 200, result);
}

export const postUserPasswordChangeFinish = withRateLimit("opaque")(
  withAudit({
    eventType: "USER_PASSWORD_CHANGE",
    resourceType: "user",
  })(postUserPasswordChangeFinishHandler)
);

export const schema = {
  method: "POST",
  path: "/password/change/finish",
  tags: ["OPAQUE"],
  summary: "passwordChangeFinish",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
