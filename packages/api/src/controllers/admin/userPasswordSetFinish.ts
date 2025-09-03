import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { opaqueRecords, userPasswordHistory, users } from "../../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, HttpHandler } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const UserPasswordSetFinishRequestSchema = z.object({
  record: z.string(),
  export_key_hash: z.string(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postUserPasswordSetFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  try {
    if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
    const session = await requireSession(context, request, true);
    if (!session.adminRole) throw new ValidationError("Admin privileges required");

    const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
    if (!user || !user.email) throw new NotFoundError("User not found");

    const body = await readBody(request);
    const data = parseJsonSafely(body) as Record<string, unknown>;
    if (!data.record || typeof data.record !== "string") {
      throw new ValidationError("Missing or invalid record field");
    }
    if (!data.export_key_hash || typeof data.export_key_hash !== "string") {
      throw new ValidationError("Missing or invalid export_key_hash field");
    }

    const record = data.record;
    const exportKeyHash = data.export_key_hash;

    const anyMatch = await context.db.query.userPasswordHistory.findFirst({
      where: (_fields, operators) =>
        operators.and(
          operators.eq(userPasswordHistory.userSub, userSub),
          operators.eq(userPasswordHistory.exportKeyHash, exportKeyHash)
        ),
    });
    if (anyMatch) {
      throw new ConflictError("Password reuse not allowed");
    }

    const recordBuffer = fromBase64Url(record);
    const opaqueRecord = await context.services.opaque.finishRegistration(recordBuffer, user.email);

    await context.db.transaction(async (tx) => {
      const existing = await tx.query.opaqueRecords.findFirst({
        where: eq(opaqueRecords.sub, userSub),
      });
      if (existing) {
        await tx
          .update(opaqueRecords)
          .set({
            envelope: Buffer.from(opaqueRecord.envelope),
            serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
            updatedAt: new Date(),
          })
          .where(eq(opaqueRecords.sub, userSub));
      } else {
        await tx.insert(opaqueRecords).values({
          sub: userSub,
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: new Date(),
        });
      }

      await tx.insert(userPasswordHistory).values({ userSub, exportKeyHash });
      await tx.update(users).set({ passwordResetRequired: true }).where(eq(users.sub, userSub));
    });

    sendJson(response, 200, { success: true });
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postUserPasswordSetFinish = withAudit({
  eventType: "USER_PASSWORD_SET",
  resourceType: "user",
  extractResourceId: (_b, params) => params[0],
})(postUserPasswordSetFinishHandler as HttpHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/users/{userSub}/password-set-finish",
    tags: ["Users"],
    summary: "Finish setting user password",
    request: {
      params: z.object({
        userSub: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UserPasswordSetFinishRequestSchema,
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
