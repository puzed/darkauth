import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { updateUserBasic } from "../../models/users.ts";
import type { Context, ControllerSchema, HttpHandler } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

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

async function updateUserHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
): Promise<void> {
  const sessionData = await (await import("../../services/sessions.ts")).requireSession(
    context,
    request,
    true
  );
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const payload = Req.parse(raw);
  const updated = await updateUserBasic(context, sub, {
    email:
      payload.email === undefined
        ? undefined
        : payload.email === null
          ? undefined
          : payload.email.trim().toLowerCase(),
    name:
      payload.name === undefined
        ? undefined
        : payload.name === null
          ? undefined
          : payload.name.trim(),
  });
  sendJson(response, 200, updated);
}

export const updateUser = withAudit({
  eventType: "USER_UPDATE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateUserHandler as HttpHandler);

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
