import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminUsers } from "../../db/schema.js";
import { ConflictError, ValidationError } from "../../errors.js";
import type { Context } from "../../types.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const Req = z.object({
  token: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["read", "write"]).optional(),
  record: z.string(),
});

export async function postInstallOpaqueRegisterFinish(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    context.logger.info("[install:opaque:finish] Beginning OPAQUE registration finish");

    if (!context.services.opaque) {
      context.logger.error("[install:opaque:finish] OPAQUE service not available");
      throw new ValidationError("OPAQUE service not available");
    }

    const body = await readBody(request);
    context.logger.debug({ bodyLen: body.length }, "[install:opaque:finish] Read request body");

    const data = Req.parse(parseJsonSafely(body));
    context.logger.info(
      { email: data.email, name: data.name, role: data.role },
      "[install:opaque:finish] Parsed request"
    );

    if (!context.services.install?.token || data.token !== context.services.install.token) {
      context.logger.error("[install:opaque:finish] Invalid install token");
      throw new ValidationError("Invalid install token");
    }

    const recordBuf = fromBase64Url(data.record);
    context.logger.debug(
      { recordLen: recordBuf.length },
      "[install:opaque:finish] Decoded OPAQUE record"
    );

    const opaque = await context.services.opaque.finishRegistration(recordBuf, data.email);
    context.logger.info(
      { envelopeLen: opaque.envelope.length, serverPubKeyLen: opaque.serverPublicKey.length },
      "[install:opaque:finish] OPAQUE registration completed"
    );

    await context.db.transaction(async (trx) => {
      context.logger.debug("[install:opaque:finish] Starting database transaction");

      let adm = await trx.query.adminUsers.findFirst({ where: eq(adminUsers.email, data.email) });
      context.logger.info(
        { found: !!adm, adminId: adm?.id },
        "[install:opaque:finish] Checked for existing admin user"
      );

      if (!adm) {
        context.logger.info("[install:opaque:finish] Creating new admin user");
        const [row] = await trx
          .insert(adminUsers)
          .values({ email: data.email, name: data.name, role: data.role || "write" })
          .returning();
        adm = row;
        context.logger.info({ adminId: adm?.id }, "[install:opaque:finish] Created admin user");
      }

      if (!adm) {
        context.logger.error("[install:opaque:finish] Failed to create admin user");
        throw new Error("Failed to create admin user");
      }

      const existing = await trx.query.adminOpaqueRecords.findFirst({
        where: eq(adminOpaqueRecords.adminId, adm.id),
      });

      if (existing) {
        context.logger.error(
          { adminId: adm.id },
          "[install:opaque:finish] OPAQUE record already exists"
        );
        throw new ConflictError("OPAQUE record already exists");
      }

      context.logger.info(
        { adminId: adm.id, envelopeLen: opaque.envelope.length },
        "[install:opaque:finish] Storing OPAQUE record"
      );

      await trx.insert(adminOpaqueRecords).values({
        adminId: adm.id,
        envelope: Buffer.from(opaque.envelope),
        serverPubkey: Buffer.from(opaque.serverPublicKey),
      });

      context.logger.info(
        { adminId: adm.id },
        "[install:opaque:finish] OPAQUE record stored successfully"
      );
    });

    context.logger.info("[install:opaque:finish] Registration complete, sending success response");
    sendJson(response, 201, { success: true });
  } catch (err) {
    context.logger.error({ err }, "[install:opaque:finish] Failed");
    sendError(response, err as Error);
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/install/opaque/finish",
    tags: ["Installation"],
    summary: "Finish OPAQUE registration for bootstrap admin",
    responses: { 201: { description: "Created" } },
  });
}
