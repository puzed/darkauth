import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteGroupHandler(
  _context: Context,
  _request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  sendJson(response, 501, { error: "Not yet implemented" });
}

export const deleteGroup = withAudit({
  eventType: "GROUP_DELETE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deleteGroupHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "delete",
    path: "/admin/groups/{key}",
    tags: ["Groups"],
    summary: "Delete group",
    request: { params: z.object({ key: z.string() }) },
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
