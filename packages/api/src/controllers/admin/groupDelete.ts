import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { deleteGroup } from "../../models/groups.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteGroupHandler(
  context: Context,
  _request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const result = await deleteGroup(context, key);
  sendJson(response, 200, result);
}

export const deleteGroupController = withAudit({
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
