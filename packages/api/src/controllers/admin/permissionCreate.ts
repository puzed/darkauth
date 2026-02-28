import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { createPermission as createPermissionModel } from "../../models/permissions.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";

import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const Req = z.object({ key: z.string(), description: z.string() });

async function createPermissionHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = Req.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const data = parsed.data;
  const permission = await createPermissionModel(context, data);
  sendJson(response, 201, permission);
}

export const createPermission = withAudit({
  eventType: "PERMISSION_CREATE",
  resourceType: "permission",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const b = body as { key?: string };
      return b.key;
    }
    return undefined;
  },
})(createPermissionHandler);

export const schema = {
  method: "POST",
  path: "/admin/permissions",
  tags: ["Permissions"],
  summary: "Create permission",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: { 201: { description: "Created" }, ...genericErrors },
} as const satisfies ControllerSchema;
