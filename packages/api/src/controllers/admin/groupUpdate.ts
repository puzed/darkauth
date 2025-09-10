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
import { sendJson } from "../../utils/http.js";

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

  const bodyChunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    request.on("data", (c) => bodyChunks.push(c));
    request.on("end", () => resolve());
  });
  const raw = Buffer.concat(bodyChunks).toString("utf8");
  const data = JSON.parse(raw) as { name?: string };
  if (!data.name || typeof data.name !== "string") {
    sendJson(response, 400, { error: "Invalid name" });
    return;
  }
  const result = await updateGroup(context, key, data.name.trim());
  sendJson(response, 200, result);
}

export const updateGroupController = withAudit({
  eventType: "GROUP_UPDATE",
  resourceType: "group",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateGroupHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({ name: z.string().min(1) });
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
