import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
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
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const Req = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    sub: z.string().optional(),
  });
  const parsed = Req.parse(raw);
  const result = await createUserModel(context, {
    email: parsed.email.trim(),
    name: parsed.name?.trim() || "",
    sub: parsed.sub?.trim(),
  });
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
    name: z.string().optional(),
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
