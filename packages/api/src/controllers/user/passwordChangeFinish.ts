import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { opaqueRecords, userPasswordHistory, users } from "../../db/schema.js";
import { ConflictError, ValidationError } from "../../errors.js";
import { verifyJWT } from "../../services/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function postUserPasswordChangeFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (!context.services.opaque) {
    throw new ValidationError("OPAQUE service not available");
  }

  const session = await requireSession(context, request, false);
  if (!session.sub || !session.email) {
    throw new ValidationError("Invalid user session");
  }
  const userSub = session.sub;

  const body = await readBody(request);
  const data = parseJsonSafely(body) as {
    record?: unknown;
    export_key_hash?: unknown;
    reauth_token?: unknown;
  };
  if (!data.record || typeof data.record !== "string") {
    throw new ValidationError("Missing or invalid record field");
  }
  if (!data.export_key_hash || typeof data.export_key_hash !== "string") {
    throw new ValidationError("Missing or invalid export_key_hash field");
  }

  // At this point, we know these fields are strings
  const record = data.record as string;
  const exportKeyHash = data.export_key_hash as string;

  let recordBuffer: Uint8Array;
  try {
    recordBuffer = fromBase64Url(record);
  } catch {
    throw new ValidationError("Invalid base64url encoding in record");
  }

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

  if (!data.reauth_token || typeof data.reauth_token !== "string") {
    throw new ValidationError("Reauthentication required");
  }

  const reauthToken = data.reauth_token as string;

  try {
    const payload = await verifyJWT(context, reauthToken);
    if (payload.sub !== session.sub || payload.purpose !== "password_change") {
      throw new ValidationError("Invalid reauthentication token");
    }
  } catch (_error) {
    throw new ValidationError("Invalid or expired reauthentication token");
  }

  const opaqueRecord = await context.services.opaque.finishRegistration(
    recordBuffer,
    session.email
  );

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

    await tx.insert(userPasswordHistory).values({ userSub: userSub, exportKeyHash: exportKeyHash });

    await tx.update(users).set({ passwordResetRequired: false }).where(eq(users.sub, userSub));
  });

  sendJson(response, 200, { success: true });
}

export const postUserPasswordChangeFinish = withAudit({
  eventType: "USER_PASSWORD_CHANGE",
  resourceType: "user",
})(postUserPasswordChangeFinishHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/password/change/finish",
    tags: ["OPAQUE"],
    summary: "passwordChangeFinish",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
