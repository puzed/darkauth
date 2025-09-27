import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";

import { deletePermissionByKey } from "../../models/permissions.js";
import type { Context, ControllerSchema } from "../../types.js";
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

export const schema = {
  method: "DELETE",
  path: "/admin/permissions/{key}",
  tags: ["Permissions"],
  summary: "Delete permission",
  params: z.object({ key: z.string() }),
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
