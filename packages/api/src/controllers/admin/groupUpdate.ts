import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { updateGroup } from "../../models/groups.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

// Request body schema used in both handler validation and OpenAPI schema
const Req = z.object({
  name: z.string().min(1).optional(),
  enableLogin: z.boolean().optional(),
  requireOtp: z.boolean().optional(),
});

async function updateGroupHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  key: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const raw = await readBody(request);
  const data = Req.parse(parseJsonSafely(raw));
  const result = await updateGroup(context, key, data);
  sendJson(response, 200, result);
}

export const updateGroupController = withAudit({
  eventType: "GROUP_UPDATE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateGroupHandler);

export const schema = {
  method: "PUT",
  path: "/admin/groups/{key}",
  tags: ["Groups"],
  summary: "Update group",
  params: z.object({ key: z.string() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
