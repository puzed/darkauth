import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function updateGroupHandler(
  _context: Context,
  _request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  sendJson(response, 501, { error: "Not yet implemented" });
}

export const updateGroup = withAudit({
  eventType: "GROUP_UPDATE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateGroupHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ name: z.string().min(1) });
  registry.registerPath({
    method: "put",
    path: "/admin/groups/{key}",
    tags: ["Groups"],
    summary: "Update group",
    request: {
      params: z.object({ key: z.string() }),
      body: { content: { "application/json": { schema: Req } } },
    },
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
