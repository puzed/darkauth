import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import type { Context } from "../../types.js";
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ key: z.string(), description: z.string() });
  registry.registerPath({
    method: "post",
    path: "/admin/permissions",
    tags: ["Permissions"],
    summary: "Create permission",
    request: { body: { content: { "application/json": { schema: Req } } } },
    responses: { 201: { description: "Created" }, ...genericErrors },
  });
}
