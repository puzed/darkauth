import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

const PermissionResponseSchema = z.object({
  key: z.string(),
  description: z.string(),
  groupCount: z.number().int().nonnegative(),
  directUserCount: z.number().int().nonnegative(),
});
export const PermissionsListResponseSchema = z.object({
  permissions: z.array(PermissionResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

import { listPermissionsWithCounts } from "../../models/permissions.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["key", "description"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const responseData = await listPermissionsWithCounts(context, parsed);
  sendJsonValidated(response, 200, responseData, PermissionsListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/permissions",
  tags: ["Permissions"],
  summary: "List permissions",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["key", "description"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: PermissionsListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
