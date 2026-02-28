import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClientSecret } from "../../models/clients.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const Resp = z.object({
  clientId: z.string(),
  clientSecret: z.string().nullable(),
});

export async function getClientSecretController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) {
  const Params = z.object({ clientId: z.string() });
  const { clientId } = Params.parse({ clientId: params[0] });

  const session = await requireSession(context, request, true);
  if (!session.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const clientSecret = await getClientSecret(context, clientId);
  sendJsonValidated(response, 200, { clientId, clientSecret }, Resp);
}

export const schema = {
  method: "GET",
  path: "/admin/clients/{clientId}/secret",
  tags: ["Clients"],
  summary: "Get OAuth client secret",
  params: z.object({ clientId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
