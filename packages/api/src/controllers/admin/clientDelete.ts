import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { deleteClient } from "../../models/clients.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ clientId: z.string() });
  const { clientId } = Params.parse({ clientId: params[0] });
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }
  const result = await deleteClient(context, clientId);
  sendJson(response, 200, result);
}

export const deleteClientController = withAudit({
  eventType: "CLIENT_DELETE",
  resourceType: "client",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deleteClientHandler);

const Resp = z.object({ success: z.boolean().optional(), message: z.string().optional() });

export const schema = {
  method: "DELETE",
  path: "/admin/clients/{clientId}",
  tags: ["Clients"],
  summary: "Delete OAuth client",
  params: z.object({ clientId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
