import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminPasswordHistory, adminUsers } from "../../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

interface PasswordSetFinishRequest {
  record: string;
  export_key_hash: string;
}

function isPasswordSetFinishRequest(data: unknown): data is PasswordSetFinishRequest {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.record === "string" && typeof obj.export_key_hash === "string";
}

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
  const adminId = _params[0];
  if (!adminId) {
    throw new ValidationError("Admin ID is required");
  }
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ValidationError("Write permission required");

  const admin = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, adminId),
  });
  if (!admin) throw new NotFoundError("Admin user not found");

  const body = await readBody(request);
  const data = parseJsonSafely(body);

  if (!isPasswordSetFinishRequest(data)) {
    throw new ValidationError(
      "Invalid request format. Expected record and export_key_hash fields."
    );
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

  const recordBuffer = fromBase64Url(data.record);
  const opaqueRecord = await context.services.opaque.finishRegistration(recordBuffer, admin.email);

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

    await tx.insert(adminPasswordHistory).values({ adminId, exportKeyHash: data.export_key_hash });
    await tx
      .update(adminUsers)
      .set({ passwordResetRequired: false })
      .where(eq(adminUsers.id, adminId));
  });

  sendJson(response, 200, { success: true });
}

export const postAdminUserPasswordSetFinish = withAudit({
  eventType: "ADMIN_PASSWORD_SET",
  resourceType: "admin",
  extractResourceId: (_body, params) => params[0],
})(postAdminUserPasswordSetFinishHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/admin-users/{adminId}/password-set-finish",
    tags: ["Admin Users"],
    summary: "Finish setting admin user password",
    request: {
      params: z.object({
        adminId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: PasswordSetFinishRequestSchema,
          },
        },
      },
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
  });
}
