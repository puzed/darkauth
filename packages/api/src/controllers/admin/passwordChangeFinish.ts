import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminPasswordHistory, adminUsers } from "../../db/schema.js";
import { ConflictError, ValidationError } from "../../errors.js";
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

    const anyMatch = await context.db.query.adminPasswordHistory.findFirst({
      where: (_fields, operators) =>
        operators.and(
          operators.eq(adminPasswordHistory.adminId, adminId),
          operators.eq(adminPasswordHistory.exportKeyHash, data.export_key_hash)
        ),
    });
    if (anyMatch) {
      throw new ConflictError("Password reuse not allowed");
    }

    const opaqueRecord = await context.services.opaque.finishRegistration(
      recordBuffer,
      session.email
    );

    await context.db.transaction(async (tx) => {
      const existing = await tx.query.adminOpaqueRecords.findFirst({
        where: eq(adminOpaqueRecords.adminId, adminId),
      });
      if (existing) {
        await tx
          .update(adminOpaqueRecords)
          .set({
            envelope: Buffer.from(opaqueRecord.envelope),
            serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
            updatedAt: new Date(),
          })
          .where(eq(adminOpaqueRecords.adminId, adminId));
      } else {
        await tx.insert(adminOpaqueRecords).values({
          adminId,
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: new Date(),
        });
      }

      await tx
        .insert(adminPasswordHistory)
        .values({ adminId, exportKeyHash: data.export_key_hash });

      await tx
        .update(adminUsers)
        .set({ passwordResetRequired: false })
        .where(eq(adminUsers.id, adminId));
    });

    sendJson(response, 200, { success: true });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postAdminPasswordChangeFinish = withAudit({
  eventType: "ADMIN_PASSWORD_CHANGE",
  resourceType: "admin",
})(postAdminPasswordChangeFinishHandler);
