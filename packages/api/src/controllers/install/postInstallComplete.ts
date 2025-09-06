import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { clients, settings } from "../../db/schema.js";
import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ForbiddenInstallTokenError,
  ValidationError,
} from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { generateEdDSAKeyPair, storeKeyPair } from "../../services/jwks.js";
import { createKekService, generateKdfParams } from "../../services/kek.js";
import {
  isSystemInitialized,
  markSystemInitialized,
  seedDefaultSettings,
} from "../../services/settings.js";
import type { Context, InstallRequest } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { generateRandomString } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

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
  const data = parseJsonSafely(body) as InstallRequest;
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

  // Validate install token (must match and be fresh)
  const token = data?.token;
  if (!token || token !== context.services.install?.token) {
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

  if (!data.adminEmail || !data.adminName) {
    throw new ValidationError("Admin email and name are required");
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
    const kekService = await createKekService(passphrase, kdfParams);

    context.logger.info(
      {
        hasTempDb: !!context.services.install?.tempDb,
        hasContextDb: !!context.db,
      },
      "[install:post] Selecting database"
    );

    const db = context.services.install?.tempDb || context.db;

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
    await db.insert(settings).values({
      key: "kek_kdf",
      value: kdfParams,
      secure: true,
      updatedAt: new Date(),
    });

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
    const _appWebClientSecret = generateRandomString(32);
    const supportDeskClientSecret = generateRandomString(32);

    const supportDeskSecretEnc = await kekService.encrypt(Buffer.from(supportDeskClientSecret));

    await db.insert(clients).values([
      {
        clientId: "app-web",
        name: "Web Application",
        type: "public",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: null,
        requirePkce: true,
        zkDelivery: "fragment-jwe",
        zkRequired: true,
        allowedJweAlgs: ["ECDH-ES"],
        allowedJweEncs: ["A256GCM"],
        redirectUris: [
          "http://localhost:9092/",
          "http://localhost:9092/callback",
          "http://localhost:3000/callback",
          "https://app.example.com/callback",
        ],
        postLogoutRedirectUris: [
          "http://localhost:9092/",
          "http://localhost:3000",
          "https://app.example.com",
        ],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        scopes: ["openid", "profile", "email"],
        allowedZkOrigins: [
          "http://localhost:9092",
          "http://localhost:3000",
          "https://app.example.com",
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        clientId: "support-desk",
        name: "Support Desk",
        type: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        clientSecretEnc: supportDeskSecretEnc,
        requirePkce: false,
        zkDelivery: "none",
        zkRequired: false,
        allowedJweAlgs: [],
        allowedJweEncs: [],
        redirectUris: ["http://localhost:4000/callback", "https://support.example.com/callback"],
        postLogoutRedirectUris: ["http://localhost:4000", "https://support.example.com"],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        scopes: ["openid", "profile"],
        allowedZkOrigins: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    context.logger.debug(
      "[install:post] verifying admin user was created during OPAQUE registration"
    );
    const existingAdmin = await db.query.adminUsers.findFirst({
      where: (tbl, { eq }) => eq(tbl.email, data.adminEmail),
    });

    if (!existingAdmin) {
      context.logger.error("[install:post] Admin user was not created during OPAQUE registration!");
      throw new Error("Admin user must be created via OPAQUE registration first");
    }

    const adminId = existingAdmin.id;
    context.logger.info({ adminId, email: data.adminEmail }, "[install:post] Admin user verified");

    // Verify OPAQUE record exists
    const opaqueRecord = await db.query.adminOpaqueRecords.findFirst({
      where: (tbl, { eq }) => eq(tbl.adminId, adminId),
    });

    if (!opaqueRecord) {
      context.logger.error("[install:post] OPAQUE record not found for admin user!");
      throw new Error("OPAQUE registration must be completed first");
    }

    context.logger.info(
      {
        adminId,
        hasEnvelope: !!opaqueRecord.envelope,
        envelopeLen: (opaqueRecord.envelope as Buffer)?.length,
      },
      "[install:post] OPAQUE record verified"
    );

    await markSystemInitialized(tempContextDb);

    context.logger.info("[install:post] installation complete");

    sendJson(response, 200, {
      success: true,
      message: "Installation completed successfully. Server will restart in 2 seconds.",
      adminId,
      clients: [
        { id: "app-web", name: "Web Application", type: "public" },
        {
          id: "support-desk",
          name: "Support Desk",
          type: "confidential",
          secret: "[encrypted]",
        },
      ],
      serverWillRestart: true,
    });

    context.services.kek = kekService;

    try {
      const { upsertConfig } = await import("../../config/saveConfig.js");
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

      context.logger.info("[install:post] Configuration saved, server will restart in 2 seconds");

      // Schedule trigger for tsx watch restart by updating reload.ts content
      setTimeout(async () => {
        context.logger.info("[install:post] Triggering restart via reload token");
        const fs = await import("node:fs");
        const path = await import("node:path");
        try {
          const reloadPath = path.resolve(process.cwd(), "src", "reload.ts");
          const stamp = Date.now();
          fs.writeFileSync(reloadPath, `export const reloadToken = ${stamp};\n`, "utf8");
          context.logger.info({ reloadPath }, "[install:post] Wrote reload token");
        } catch (touchErr) {
          context.logger.warn(
            { err: touchErr },
            "[install:post] Failed to write reload token, falling back to exit"
          );
          process.exit(0);
        }
      }, 2000);
    } catch (err) {
      context.logger.error({ err }, "[install:post] Failed to save configuration");
    }

    if (context.services.install) {
      context.services.install.token = undefined;
      context.services.install.createdAt = undefined;
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
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const data = body as { adminEmail?: string };
      return data.adminEmail;
    }
    return undefined;
  },
})(_postInstallComplete);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/install",
    tags: ["Installation"],
    summary: "Complete system installation",
    request: {
      body: {
        content: {
          "application/json": {
            schema: InstallCompleteRequestSchema,
          },
        },
      },
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
  });
}
