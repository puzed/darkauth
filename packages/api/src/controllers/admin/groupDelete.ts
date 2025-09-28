import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";

import { deleteGroup } from "../../models/groups.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteGroupHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const result = await deleteGroup(context, key);
  sendJson(response, 200, result);
}

export const deleteGroupController = withAudit({
  eventType: "GROUP_DELETE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deleteGroupHandler);

export const schema = {
  method: "DELETE",
  path: "/admin/groups/{key}",
  tags: ["Groups"],
  summary: "Delete group",
  params: z.object({ key: z.string() }),
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
