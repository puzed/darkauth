import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { deleteUser as deleteUserModel } from "../../models/users.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

async function deleteUserHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ sub: z.string() });
  const { sub } = Params.parse({ sub: params[0] });
  const sessionData = await (await import("../../services/sessions.js")).requireSession(
    context,
    request,
    true
  );
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  await deleteUserModel(context, sub);
  sendJson(response, 200, { message: "User deleted" });
}

export const deleteUser = withAudit({
  eventType: "USER_DELETE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  skipBodyCapture: true,
})(deleteUserHandler);

const Resp = z.object({ message: z.string() });

export const schema = {
  method: "DELETE",
  path: "/admin/users/{sub}",
  tags: ["Users"],
  summary: "Delete user",
  params: z.object({ sub: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
