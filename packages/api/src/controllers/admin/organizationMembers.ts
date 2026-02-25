import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listOrganizationMembersAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
  userSub: z.string(),
  status: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  roles: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      name: z.string(),
    })
  ),
});

const ResponseSchema = z.object({
  members: z.array(MemberSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

export async function getOrganizationMembersAdmin(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["userSub", "email", "name", "status", "createdAt"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const result = await listOrganizationMembersAdmin(context, organizationId, parsed);
  sendJsonValidated(response, 200, result, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "List organization members",
  params: z.object({ organizationId: z.string().uuid() }),
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["userSub", "email", "name", "status", "createdAt"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
