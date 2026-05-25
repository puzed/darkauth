import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { revokeRefreshToken } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseFormBody, readBody, sendJson } from "../../utils/http.ts";
import { authenticateRevocationClient } from "./oauthClientAuth.ts";

async function postRevokeHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const formData = parseFormBody(await readBody(request));
  const token = formData.get("token") || "";
  if (!token) throw new InvalidRequestError("token is required");
  const client = await authenticateRevocationClient(context, request, formData);
  await revokeRefreshToken(context, token, client.clientId);
  sendJson(response, 200, {});
}

export const postRevoke = withRateLimit("token")(postRevokeHandler);

const Req = z.object({
  token: z.string().min(1),
  token_type_hint: z.string().optional(),
  client_id: z.string().optional(),
});

const Resp = z.object({});

export const schema = {
  method: "POST",
  path: "/revoke",
  tags: ["Auth"],
  summary: "Token revocation endpoint",
  body: {
    required: true,
    contentType: "application/x-www-form-urlencoded",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
