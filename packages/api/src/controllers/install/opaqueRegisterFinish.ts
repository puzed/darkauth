import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ValidationError,
} from "../../errors.ts";
import { storeOpaqueAdmin } from "../../models/install.ts";
import { ensureOpaqueService } from "../../services/opaque.ts";
import { isSystemInitialized } from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.ts";

const Req = z.object({
  token: z.string().optional(),
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
    const initialized = await isSystemInitialized(context);
    if (initialized) {
      throw new AlreadyInitializedError();
    }

    let svc: NonNullable<Context["services"]["opaque"]>;
    try {
      svc = await ensureOpaqueService(context);
    } catch (err) {
      context.logger.error({ err }, "[install:opaque:finish] Failed to create OPAQUE service");
      throw new ValidationError("Database not prepared");
    }

    const body = await readBody(request);
    context.logger.debug({ bodyLen: body.length }, "[install:opaque:finish] Read request body");

    const data = Req.parse(parseJsonSafely(body));
    context.logger.info(
      { email: data.email, name: data.name, role: data.role },
      "[install:opaque:finish] Parsed request"
    );

    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const providedToken =
      data.token || url.searchParams.get("token") || context.config.installToken || "";
    if (!context.services.install?.token || providedToken !== context.services.install.token) {
      context.logger.error("[install:opaque:finish] Invalid install token");
      throw new ValidationError("Invalid install token");
    }
    if (context.services.install?.createdAt) {
      const tokenAge = Date.now() - (context.services.install.createdAt || 0);
      if (tokenAge > 10 * 60 * 1000) {
        throw new ExpiredInstallTokenError();
      }
    }

    if (context.services.install.adminCreated) {
      throw new ValidationError("Bootstrap admin already created");
    }

    if (context.services.install.adminEmail && context.services.install.adminEmail !== data.email) {
      throw new ValidationError("Admin email does not match installation");
    }

    const recordBuf = fromBase64Url(data.record);
    context.logger.debug(
      { recordLen: recordBuf.length },
      "[install:opaque:finish] Decoded OPAQUE record"
    );

    const opaque = await svc.finishRegistration(recordBuf, data.email);
    context.logger.info(
      { envelopeLen: opaque.envelope.length, serverPubKeyLen: opaque.serverPublicKey.length },
      "[install:opaque:finish] OPAQUE registration completed"
    );

    const effContext = context.services.install?.tempDb
      ? ({ ...context, db: context.services.install.tempDb } as Context)
      : context;
    await storeOpaqueAdmin(effContext, {
      email: data.email,
      name: data.name,
      role: data.role || "write",
      envelope: opaque.envelope,
      serverPublicKey: opaque.serverPublicKey,
    });

    let install = context.services.install;
    if (!install) {
      install = { adminEmail: data.email, adminCreated: true };
      context.services.install = install;
    } else {
      if (!install.adminEmail) install.adminEmail = data.email;
      install.adminCreated = true;
    }
    if (context.services.install) {
      context.services.install.token = undefined;
    }

    context.logger.info("[install:opaque:finish] Registration complete, sending success response");
    sendJson(response, 201, { success: true });
  } catch (err) {
    context.logger.error({ err }, "[install:opaque:finish] Failed");
    sendError(response, err as Error);
  }
}

export const schema = {
  method: "POST",
  path: "/install/opaque/finish",
  tags: ["Installation"],
  summary: "Finish OPAQUE registration for bootstrap admin",
  responses: { 201: { description: "Created" } },
} as const satisfies ControllerSchema;
