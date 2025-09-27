import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { updateUserBasic } from "../../models/users.js";
import type { Context, ControllerSchema, HttpHandler } from "../../types.js";
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
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
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

// OpenAPI schema definition
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

export const schema = {
  method: "PUT",
  path: "/admin/users/{sub}",
  tags: ["Users"],
  summary: "Update user",
  params: z.object({ sub: z.string() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
