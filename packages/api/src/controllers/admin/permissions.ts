import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";

const PermissionResponseSchema = z.object({
  key: z.string(),
  description: z.string(),
  groupCount: z.number().int().nonnegative(),
  directUserCount: z.number().int().nonnegative(),
});
export const PermissionsListResponseSchema = z.object({
  permissions: z.array(PermissionResponseSchema),
});

import { listPermissionsWithCounts } from "../../models/permissions.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

export async function getPermissions(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const responseData = { permissions: await listPermissionsWithCounts(context) };
  sendJsonValidated(response, 200, responseData, PermissionsListResponseSchema);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/admin/permissions",
    tags: ["Permissions"],
    summary: "List permissions",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PermissionsListResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
