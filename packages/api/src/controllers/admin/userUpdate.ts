import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { and, eq, ne } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
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

  const existing = await context.db.query.users.findFirst({
    where: eq(users.sub, sub),
  });
  if (!existing) throw new NotFoundError("User not found");

  const body = await readBody(request);
  const data = parseJsonSafely(body) as Record<string, unknown>;

  const updates: { email?: string | null; name?: string | null } = {};

  if ("email" in data) {
    if (data.email === null || data.email === "") {
      updates.email = null;
    } else if (typeof data.email === "string") {
      const email = data.email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) throw new ValidationError("Invalid email format");
      const other = await context.db.query.users.findFirst({
        where: and(eq(users.email, email), ne(users.sub, sub)),
      });
      if (other) throw new ConflictError("User with this email already exists");
      updates.email = email;
    } else {
      throw new ValidationError("Invalid email value");
    }
  }

  if ("name" in data) {
    if (data.name === null) updates.name = null;
    else if (typeof data.name === "string") updates.name = data.name.trim();
    else throw new ValidationError("Invalid name value");
  }

  if (Object.keys(updates).length === 0) {
    sendJson(response, 200, { ...existing });
    return;
  }

  await context.db.update(users).set(updates).where(eq(users.sub, sub));
  const updated = await context.db.query.users.findFirst({
    where: eq(users.sub, sub),
  });
  sendJson(response, 200, updated || existing);
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
