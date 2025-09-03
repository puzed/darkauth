import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { groups, userGroups, users } from "../../db/schema.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getUserGroups(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  // Require admin session
  const sessionData = await requireSession(context, request, true);

  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  if (!userSub || typeof userSub !== "string") {
    throw new ValidationError("Invalid user subject");
  }

  // Verify user exists
  const user = await context.db.query.users.findFirst({
    where: eq(users.sub, userSub),
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Get user's groups
  const userGroupsData = await context.db
    .select({
      groupKey: groups.key,
      groupName: groups.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupKey, groups.key))
    .where(eq(userGroups.userSub, userSub));

  // Get all available groups for reference
  const allGroups = await context.db
    .select({
      key: groups.key,
      name: groups.name,
    })
    .from(groups)
    .orderBy(groups.name);

  const responseData = {
    user: {
      sub: user.sub,
      email: user.email,
      name: user.name,
    },
    userGroups: userGroupsData.map((g) => ({
      key: g.groupKey,
      name: g.groupName,
    })),
    availableGroups: allGroups,
  };

  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Group = z.object({ key: z.string(), name: z.string() });
  const User = z.object({
    sub: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  });
  const Resp = z.object({
    user: User,
    userGroups: z.array(Group),
    availableGroups: z.array(Group),
  });
  registry.registerPath({
    method: "get",
    path: "/admin/users/{sub}/groups",
    tags: ["Users"],
    summary: "Get user groups",
    request: { params: z.object({ sub: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Resp } } } },
  });
}
