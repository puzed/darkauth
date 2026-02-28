import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { adminPasswordChangeFinish } from "../../models/adminPasswords.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.ts";

const Req = z.object({ record: z.string(), export_key_hash: z.string() });
const AdminPasswordChangeFinishResponseSchema = z.object({ success: z.boolean() });

async function postAdminPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    await requireOpaqueService(context);

    const session = await requireSession(context, request, true);
    if (!session.adminId || !session.email) {
      throw new ValidationError("Invalid admin session");
    }
    const adminId = session.adminId;

    const body = await readBody(request);
    const data = parseJsonSafely(body);
    const parsed = Req.safeParse(data);
    if (!parsed.success)
      throw new ValidationError(
        "Invalid request format. Expected record and export_key_hash fields.",
        parsed.error.flatten()
      );

    let recordBuffer: Uint8Array;
    try {
      recordBuffer = fromBase64Url(parsed.data.record);
    } catch {
      throw new ValidationError("Invalid base64url encoding in record");
    }

    const result = await adminPasswordChangeFinish(context, {
      adminId,
      email: session.email,
      recordBuffer,
      exportKeyHash: parsed.data.export_key_hash,
    });
    sendJson(response, 200, result);
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postAdminPasswordChangeFinish = withAudit({
  eventType: "ADMIN_PASSWORD_CHANGE",
  resourceType: "admin",
})(postAdminPasswordChangeFinishHandler);

export const schema = {
  method: "POST",
  path: "/admin/password/change/finish",
  tags: ["Auth"],
  summary: "Complete admin password change",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: {
      description: "Password updated",
      content: { "application/json": { schema: AdminPasswordChangeFinishResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
