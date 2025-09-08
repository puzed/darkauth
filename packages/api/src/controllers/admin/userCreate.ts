import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { createUser as createUserModel } from "../../models/users.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function createUserHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
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

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const subInput = typeof data.sub === "string" ? data.sub.trim() : "";

  if (!email) throw new ValidationError("Email is required");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new ValidationError("Invalid email format");

  const result = await createUserModel(context, { email, name, sub: subInput });
  sendJson(response, 201, result);
}

export const createUser = withAudit({
  eventType: "USER_CREATE",
  resourceType: "user",
  extractResourceId: (body: unknown, _params: string[], responseData?: unknown) => {
    const rd = responseData as { sub?: string } | undefined;
    const b = body as { sub?: string; email?: string } | undefined;
    return rd?.sub ?? b?.sub ?? b?.email;
  },
})(createUserHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    sub: z.string().optional(),
  });
  const Resp = z.object({
    sub: z.string(),
    email: z.string().email(),
    name: z.string().nullable().optional(),
    createdAt: z.string(),
  });
  registry.registerPath({
    method: "post",
    path: "/admin/users",
    tags: ["Users"],
    summary: "Create user",
    request: { body: { content: { "application/json": { schema: Req } } } },
    responses: {
      201: { description: "Created", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
