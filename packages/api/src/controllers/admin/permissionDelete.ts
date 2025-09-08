import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { deletePermissionByKey } from "../../models/permissions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deletePermissionHandler(
  context: Context,
  _request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const result = await deletePermissionByKey(context, key);
  sendJson(response, 200, result);
}

export const deletePermission = withAudit({
  eventType: "PERMISSION_DELETE",
  resourceType: "permission",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deletePermissionHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "delete",
    path: "/admin/permissions/{key}",
    tags: ["Permissions"],
    summary: "Delete permission",
    request: { params: z.object({ key: z.string() }) },
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
