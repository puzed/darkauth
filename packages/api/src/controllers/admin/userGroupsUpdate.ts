import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
export const UpdateUserGroupsSchema = z.object({
  groups: z.array(z.string()),
});
export const UpdateUserGroupsResponseSchema = z.object({
  success: z.boolean(),
  user: z.object({
    sub: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
  }),
  userGroups: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
    })
  ),
});

import { setUserGroups } from "../../models/groups.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.ts";

async function updateUserGroupsHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ userSub: z.string() });
  const { userSub } = Params.parse({ userSub: params[0] });
  // Require admin session with write permission
  const sessionData = await requireSession(context, request, true);

  if (sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  // Read and parse request body
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = UpdateUserGroupsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const groupKeys = parsed.data.groups;

  const { user, userGroups: updated } = await setUserGroups(context, userSub, groupKeys);
  const responseData = {
    success: true,
    user: { sub: user.sub, email: user.email, name: user.name },
    userGroups: updated,
  };

  sendJsonValidated(response, 200, responseData, UpdateUserGroupsResponseSchema);
}

export const updateUserGroups = withAudit({
  eventType: "USER_GROUPS_UPDATE",
  resourceType: "user",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(updateUserGroupsHandler);

export const schema = {
  method: "PUT",
  path: "/admin/users/{userSub}/groups",
  tags: ["Users"],
  summary: "Update user groups",
  params: z.object({
    userSub: z.string(),
  }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UpdateUserGroupsSchema,
  },
  responses: {
    200: {
      description: "User groups updated successfully",
      content: {
        "application/json": {
          schema: UpdateUserGroupsResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
