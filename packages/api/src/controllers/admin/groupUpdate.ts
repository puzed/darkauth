import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { updateGroup } from "../../models/groups.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

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
  const data = parseJsonSafely(raw) as { name?: string; enableLogin?: boolean };
  if (data.name !== undefined && typeof data.name !== "string") {
    sendJson(response, 400, { error: "Invalid name" });
    return;
  }
  if (data.enableLogin !== undefined && typeof data.enableLogin !== "boolean") {
    sendJson(response, 400, { error: "Invalid enableLogin" });
    return;
  }
  if (data.name === undefined && data.enableLogin === undefined) {
    sendJson(response, 400, { error: "No updates provided" });
    return;
  }
  const result = await updateGroup(context, key, {
    name: data.name,
    enableLogin: data.enableLogin,
  });
  sendJson(response, 200, result);
}

export const updateGroupController = withAudit({
  eventType: "GROUP_UPDATE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateGroupHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ name: z.string().min(1).optional(), enableLogin: z.boolean().optional() });
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
