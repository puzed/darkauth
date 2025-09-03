import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteUserHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const sub = params[0];
  if (!sub) {
    throw new ValidationError("User sub is required");
  }
  const sessionData = await (await import("../../services/sessions.js")).requireSession(
    context,
    request,
    true
  );
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const found = await context.db.query.users.findFirst({
    where: eq(users.sub, sub),
  });
  if (!found) throw new NotFoundError("User not found");

  await context.db.delete(users).where(eq(users.sub, sub));
  sendJson(response, 200, { message: "User deleted" });
}

export const deleteUser = withAudit({
  eventType: "USER_DELETE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deleteUserHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({ message: z.string() });
  registry.registerPath({
    method: "delete",
    path: "/admin/users/{sub}",
    tags: ["Users"],
    summary: "Delete user",
    request: { params: z.object({ sub: z.string() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
