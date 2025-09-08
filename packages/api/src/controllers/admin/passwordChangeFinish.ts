import type { IncomingMessage, ServerResponse } from "node:http";
import { ValidationError } from "../../errors.js";
import { adminPasswordChangeFinish } from "../../models/adminPasswords.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

interface PasswordChangeFinishRequest {
  record: string;
  export_key_hash: string;
}

function isPasswordChangeFinishRequest(data: unknown): data is PasswordChangeFinishRequest {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.record === "string" && typeof obj.export_key_hash === "string";
}

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

    if (!isPasswordChangeFinishRequest(data)) {
      throw new ValidationError(
        "Invalid request format. Expected record and export_key_hash fields."
      );
    }

    let recordBuffer: Uint8Array;
    try {
      recordBuffer = fromBase64Url(data.record);
    } catch {
      throw new ValidationError("Invalid base64url encoding in record");
    }

    const result = await adminPasswordChangeFinish(context, {
      adminId,
      email: session.email,
      recordBuffer,
      exportKeyHash: data.export_key_hash,
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
