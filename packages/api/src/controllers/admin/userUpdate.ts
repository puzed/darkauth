import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { updateUserBasic } from "../../models/users.js";
import type { Context, HttpHandler } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function updateUserHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
): Promise<void> {
  const sessionData = await (await import("../../services/sessions.js")).requireSession(
    context,
    request,
    true
  );
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const body = await readBody(request);
  const data = parseJsonSafely(body) as Record<string, unknown>;
  const payload = data as Partial<{ email: string | null; name: string | null }>;
  const updated = await updateUserBasic(context, sub, {
    email: payload.email ?? undefined,
    name: payload.name ?? undefined,
  });
  sendJson(response, 200, updated);
}

export const updateUser = withAudit({
  eventType: "USER_UPDATE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateUserHandler as HttpHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z
    .object({
      email: z.string().email().nullable().optional(),
      name: z.string().nullable().optional(),
    })
    .partial();
  const Resp = z
    .object({
      sub: z.string(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
    .partial();
  registry.registerPath({
    method: "put",
    path: "/admin/users/{sub}",
    tags: ["Users"],
    summary: "Update user",
    request: {
      params: z.object({ sub: z.string() }),
      body: { content: { "application/json": { schema: Req } } },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
