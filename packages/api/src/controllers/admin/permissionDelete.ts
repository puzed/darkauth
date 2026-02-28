import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";

import { deletePermissionByKey } from "../../models/permissions.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJson } from "../../utils/http.ts";

async function deletePermissionHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

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
