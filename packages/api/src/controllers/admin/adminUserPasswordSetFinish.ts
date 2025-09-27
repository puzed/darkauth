import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { adminUserPasswordSetFinish } from "../../models/adminPasswords.js";
import { getAdminById } from "../../models/adminUsers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

const PasswordSetFinishRequestSchema = z.object({
  record: z.string(),
  export_key_hash: z.string(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postAdminUserPasswordSetFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
) {
  const Params = z.object({ adminId: z.string() });
  const { adminId } = Params.parse({ adminId: _params[0] });
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ValidationError("Write permission required");

  const admin = await getAdminById(context, adminId);
  if (!admin) throw new NotFoundError("Admin user not found");

  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const parsed = PasswordSetFinishRequestSchema.safeParse(data);
  if (!parsed.success)
    throw new ValidationError(
      "Invalid request format. Expected record and export_key_hash fields.",
      parsed.error.flatten()
    );

  const recordBuffer = fromBase64Url(parsed.data.record);
  const result = await adminUserPasswordSetFinish(context, {
    adminId,
    email: admin.email,
    recordBuffer,
    exportKeyHash: parsed.data.export_key_hash,
  });
  sendJson(response, 200, result);
}

export const postAdminUserPasswordSetFinish = withAudit({
  eventType: "ADMIN_PASSWORD_SET",
  resourceType: "admin",
  extractResourceId: (_body, params) => params[0],
})(postAdminUserPasswordSetFinishHandler);

export const schema = {
  method: "POST",
  path: "/admin/admin-users/{adminId}/password-set-finish",
  tags: ["Admin Users"],
  summary: "Finish setting admin user password",
  params: z.object({
    adminId: z.string(),
  }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: PasswordSetFinishRequestSchema,
  },
  responses: {
    200: {
      description: "Password set successfully",
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
