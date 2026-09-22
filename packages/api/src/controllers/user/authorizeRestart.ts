import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { readBody, sendJsonValidated } from "../../utils/http.ts";

const RequestSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  state: z.string().optional(),
});
const ResponseSchema = z.object({ redirect_url: z.string().url() });

export async function postAuthorizeRestart(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const parsed = RequestSchema.safeParse({
    client_id: params.get("client_id") || undefined,
    redirect_uri: params.get("redirect_uri") || undefined,
    state: params.get("state") || undefined,
  });
  if (!parsed.success) throw new InvalidRequestError("Invalid restart request");

  const client = await getClient(context, parsed.data.client_id);
  if (!client) throw new InvalidRequestError("Unknown client");
  if (!client.redirectUris.includes(parsed.data.redirect_uri)) {
    throw new InvalidRequestError("Invalid redirect URI");
  }

  const redirectUrl = new URL(parsed.data.redirect_uri);
  redirectUrl.searchParams.set("error", "invalid_request");
  redirectUrl.searchParams.set("error_description", "Authorization request has expired");
  if (parsed.data.state) redirectUrl.searchParams.set("state", parsed.data.state);

  sendJsonValidated(response, 200, { redirect_url: redirectUrl.toString() }, ResponseSchema);
}

export const schema = {
  method: "POST",
  path: "/authorize/restart",
  tags: ["Auth"],
  summary: "Return an expired authorization request to the client",
  body: {
    description: "",
    required: true,
    contentType: "application/x-www-form-urlencoded",
    schema: RequestSchema,
  },
  responses: {
    200: {
      description: "Redirect target",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
