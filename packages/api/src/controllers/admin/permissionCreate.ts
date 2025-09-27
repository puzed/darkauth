import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import type { Context, ControllerSchema } from "../../types.js";

import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function createPermissionHandler(
  _context: Context,
  _request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  sendJson(response, 501, { error: "Not yet implemented" });
}

export const createPermission = withAudit({
  eventType: "PERMISSION_CREATE",
  resourceType: "permission",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const b = body as { key?: string };
      return b.key;
    }
    return undefined;
  },
})(createPermissionHandler);

const Req = z.object({ key: z.string(), description: z.string() });

export const schema = {
  method: "POST",
  path: "/admin/permissions",
  tags: ["Permissions"],
  summary: "Create permission",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;
