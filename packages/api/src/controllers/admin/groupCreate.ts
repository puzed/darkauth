import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq, inArray } from "drizzle-orm";
import { groupPermissions, groups, permissions } from "../../db/schema.js";
import { ConflictError, ForbiddenError, ValidationError } from "../../errors.js";
export const CreateGroupSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Key must contain only alphanumeric characters, underscores, and hyphens"
    ),
  name: z.string().min(1),
  permissionKeys: z.array(z.string()).optional().default([]),
});
export const CreateGroupResponseSchema = z.object({
  success: z.boolean(),
  group: z.object({
    key: z.string(),
    name: z.string(),
    permissions: z.array(z.object({ key: z.string(), description: z.string() })),
    permissionCount: z.number().int().nonnegative(),
    userCount: z.number().int().nonnegative(),
  }),
});

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

async function createGroupHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  // Require admin session with write permission
  const sessionData = await requireSession(context, request, true);

  if (sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  // Read and parse request body
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = CreateGroupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const data = parsed.data;
  const permissionKeys = data.permissionKeys;

  // Check if group already exists
  const existingGroup = await context.db.query.groups.findFirst({
    where: eq(groups.key, data.key),
  });

  if (existingGroup) {
    throw new ConflictError("Group with this key already exists");
  }

  // Verify all provided permissions exist
  if (permissionKeys.length > 0) {
    const existingPermissions = await context.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));

    if (existingPermissions.length !== permissionKeys.length) {
      const existingKeys = existingPermissions.map((p) => p.key);
      const missingKeys = permissionKeys.filter((key: string) => !existingKeys.includes(key));
      throw new ValidationError(`Permissions not found: ${missingKeys.join(", ")}`);
    }
  }

  // Create group and assign permissions in transaction
  await context.db.transaction(async (trx) => {
    // Create the group
    await trx.insert(groups).values({
      key: data.key,
      name: data.name,
    });

    // Assign permissions if any
    if (permissionKeys.length > 0) {
      await trx.insert(groupPermissions).values(
        permissionKeys.map((permissionKey: string) => ({
          groupKey: data.key,
          permissionKey,
        }))
      );
    }
  });

  // Get the created group with its permissions for response
  const createdGroup = await context.db.query.groups.findFirst({
    where: eq(groups.key, data.key),
  });

  const assignedPermissions = await context.db
    .select({
      key: permissions.key,
      description: permissions.description,
    })
    .from(groupPermissions)
    .innerJoin(permissions, eq(groupPermissions.permissionKey, permissions.key))
    .where(eq(groupPermissions.groupKey, data.key))
    .orderBy(permissions.key);

  const responseData = {
    success: true,
    group: {
      key: createdGroup?.key,
      name: createdGroup?.name,
      permissions: assignedPermissions,
      permissionCount: assignedPermissions.length,
      userCount: 0, // New group starts with 0 users
    },
  };

  sendJsonValidated(response, 201, responseData, CreateGroupResponseSchema);
}

export const createGroup = withAudit({
  eventType: "GROUP_CREATE",
  resourceType: "group",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const b = body as { key?: string };
      return b.key;
    }
    return undefined;
  },
})(createGroupHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/groups",
    tags: ["Groups"],
    summary: "Create group",
    request: { body: { content: { "application/json": { schema: CreateGroupSchema } } } },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: CreateGroupResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
