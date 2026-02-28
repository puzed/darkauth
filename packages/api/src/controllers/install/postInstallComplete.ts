import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ForbiddenInstallTokenError,
  ValidationError,
} from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { generateEdDSAKeyPair, storeKeyPair } from "../../services/jwks.ts";
import { ensureKekService, generateKdfParams } from "../../services/kek.ts";
import {
  isSystemInitialized,
  markSystemInitialized,
  seedDefaultSettings,
} from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { generateRandomString } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const InstallCompleteRequestSchema = z.object({
  token: z.string(),
  adminEmail: z.string().email(),
  adminName: z.string(),
  kekPassphrase: z.string().optional(),
});

const InstallCompleteResponseSchema = z.object({
  adminId: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
});

async function _postInstallComplete(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  context.logger.debug("[install:post] begin");
  const initialized = await isSystemInitialized(context);
  if (initialized) {
    throw new AlreadyInitializedError();
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const data = InstallCompleteRequestSchema.parse(raw);
  context.logger.debug({ bodyLength: body.length }, "[install:post] received body");
  context.logger.debug(
    {
      adminEmail: data?.adminEmail,
      adminName: data?.adminName,
      secureMode: true,
      hasPassphrase: true,
    },
    "[install:post] parsed payload"
  );

  // Validate install token (must match and be fresh) unless admin was already created
  const providedToken = data.token;
  const adminFinished = !!context.services.install?.adminCreated;
  if (!adminFinished) {
    if (!providedToken || providedToken !== context.services.install?.token) {
      if (!context.config.isDevelopment) {
        throw new ForbiddenInstallTokenError();
      }
    }
    if (context.services.install?.createdAt) {
      const tokenAge = Date.now() - (context.services.install?.createdAt || 0);
      if (tokenAge > 10 * 60 * 1000 && !context.config.isDevelopment) {
        throw new ExpiredInstallTokenError();
      }
    }
  }

  if (!context.config.kekPassphrase) {
    if (!data.kekPassphrase || data.kekPassphrase.length === 0) {
      throw new ValidationError("KEK passphrase must be provided");
    }
    context.config.kekPassphrase = data.kekPassphrase;
  }

  try {
    context.logger.info("[install:post] starting installation");

    const passphrase = context.config.kekPassphrase;
    const kdfParams = generateKdfParams();
    const kekService = await ensureKekService(context, passphrase, kdfParams);

    context.logger.info(
      {
        hasTempDb: !!context.services.install?.tempDb,
        hasContextDb: !!context.db,
      },
      "[install:post] Selecting database"
    );

    const db =
      context.services.install?.tempDb || (!context.config.inInstallMode ? context.db : undefined);

    if (!db) {
      context.logger.error("[install:post] No database available!");
      throw new Error("No database available for installation");
    }

    context.logger.info("[install:post] Seeding default settings");
    const tempContextDb = { ...context, db } as Context;
    await seedDefaultSettings(
      tempContextDb,
      context.config.issuer,
      context.config.publicOrigin,
      context.config.rpId
    );
    const installCtx = { ...context, db } as Context;
    await (await import("../../models/install.ts")).writeKdfSetting(installCtx, kdfParams);

    context.logger.debug("[install:post] generating signing keys");
    const { publicJwk, privateJwk, kid } = await generateEdDSAKeyPair();

    const tempContextForKeys = {
      ...context,
      db,
      services: {
        ...context.services,
        kek: kekService,
      },
    } as Context;

    await storeKeyPair(tempContextForKeys, kid, publicJwk, privateJwk);

    context.logger.debug("[install:post] creating default clients");
    const demoConfidentialClientSecret = generateRandomString(32);

    const demoConfidentialSecretEnc = await kekService.encrypt(
      Buffer.from(demoConfidentialClientSecret)
    );
    await (await import("../../models/install.ts")).seedDefaultClients(
      installCtx,
      demoConfidentialSecretEnc
    );
    await (await import("../../models/install.ts")).ensureDefaultOrganizationAndSchema(installCtx);
    await (await import("../../models/install.ts")).seedDefaultOrganizationRbac(installCtx);

    context.logger.debug(
      "[install:post] verifying admin user was created during OPAQUE registration"
    );
    const adminId = await (await import("../../models/install.ts")).verifyAdminAndOpaque(
      installCtx,
      data.adminEmail
    );
    context.logger.info({ adminId, email: data.adminEmail }, "[install:post] Admin user verified");

    // Verify OPAQUE record exists
    context.logger.info({ adminId }, "[install:post] OPAQUE record verified");

    const admins = await installCtx.db.query.adminUsers.findMany();
    if (admins.length !== 1) {
      throw new ValidationError("Exactly one admin must exist after bootstrap");
    }

    if (context.services.install) {
      context.services.install.token = undefined;
      context.services.install.createdAt = undefined;
    }

    await markSystemInitialized(tempContextDb);

    context.logger.info("[install:post] installation complete");

    sendJson(response, 200, {
      success: true,
      message: "Installation completed successfully. Server will restart in 2 seconds.",
      adminId,
      clients: [
        { id: "demo-public-client", name: "Demo Public Client", type: "public" },
        {
          id: "demo-confidential-client",
          name: "Demo Confidential Client",
          type: "confidential",
          secret: "[encrypted]",
        },
      ],
      serverWillRestart: true,
    });

    try {
      const { upsertConfig } = await import("../../config/saveConfig.ts");
      upsertConfig(
        {
          kekPassphrase: context.config.kekPassphrase,
          dbMode: context.services.install?.chosenDbMode || context.config.dbMode || "remote",
          postgresUri: context.services.install?.chosenPostgresUri || context.config.postgresUri,
          pgliteDir: context.services.install?.chosenPgliteDir || context.config.pgliteDir,
          userPort: context.config.userPort,
          adminPort: context.config.adminPort,
          proxyUi: context.config.proxyUi,
        },
        context.config.configFile
      );

      context.logger.info("[install:post] Configuration saved, scheduling restart");
      if (!context.services.install) {
        context.services.install = {};
      }
      const install = context.services.install;
      install.restartRequested = true;
    } catch (err) {
      context.logger.error({ err }, "[install:post] Failed to save configuration");
    }

    if (context.services.install) {
      try {
        await context.services.install.tempDbClose?.();
      } catch {}
    }
  } catch (error) {
    context.logger.error({ err: error }, "Installation failed");
    throw error;
  }
}

export const postInstallComplete = withAudit({
  eventType: "SYSTEM_INSTALL",
  resourceType: "system",
  flushAudit: true,
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const data = body as { adminEmail?: string };
      return data.adminEmail;
    }
    return undefined;
  },
})(_postInstallComplete);

export const schema = {
  method: "POST",
  path: "/install",
  tags: ["Installation"],
  summary: "Complete system installation",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: InstallCompleteRequestSchema,
  },
  responses: {
    200: {
      description: "Installation completed successfully",
      content: {
        "application/json": {
          schema: InstallCompleteResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
