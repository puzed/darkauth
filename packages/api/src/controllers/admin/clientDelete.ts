import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { deleteClient } from "../../models/clients.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const clientId = params[0];
  if (!clientId) {
    throw new ValidationError("Client ID is required");
  }
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({ success: z.boolean().optional(), message: z.string().optional() });
  registry.registerPath({
    method: "delete",
    path: "/admin/clients/{clientId}",
    tags: ["Clients"],
    summary: "Delete OAuth client",
    request: { params: z.object({ clientId: z.string() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
