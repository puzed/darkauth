import type { IncomingMessage, ServerResponse } from "node:http";
import { NotFoundError, UnauthorizedError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getWrappedDrk as getWrappedDrkModel } from "../../models/wrappedRootKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { toBase64Url } from "../../utils/crypto.js";
import { sendJson } from "../../utils/http.js";

export async function getWrappedDrk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) {
    throw new UnauthorizedError("User session required");
  }

  const wrappedRaw = await getWrappedDrkModel(context, sessionData.sub);
  if (!wrappedRaw) throw new NotFoundError("Not found");
  const wrapped = Buffer.isBuffer(wrappedRaw)
    ? wrappedRaw
    : Buffer.from(wrappedRaw as unknown as string);

  const wrappedDrkBase64Url = toBase64Url(wrapped);

  sendJson(response, 200, {
    wrapped_drk: wrappedDrkBase64Url,
  });
}

export const schema = {
  method: "GET",
  path: "/crypto/wrapped-drk",
  tags: ["Crypto"],
  summary: "wrappedDrk",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
