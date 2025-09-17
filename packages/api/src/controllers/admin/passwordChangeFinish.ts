import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { ValidationError } from "../../errors.js";
import { adminPasswordChangeFinish } from "../../models/adminPasswords.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const Req = z.object({ record: z.string(), export_key_hash: z.string() });

async function postAdminPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

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
