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
    throw new ValidationError("KEK passphrase must be set in config.yaml");
  }

  try {
    context.logger.info("[install:post] starting installation");

    const passphrase = context.config.kekPassphrase;
    const kdfParams = generateKdfParams();
    const kekService = await createKekService(passphrase, kdfParams);
    await seedDefaultSettings(
      context,
      context.config.issuer,
      context.config.publicOrigin,
      context.config.rpId
    );
    await context.db.insert(settings).values({
      key: "kek_kdf",
      value: kdfParams,
      secure: true,
      updatedAt: new Date(),
    });

    context.logger.debug("[install:post] generating signing keys");
    const { publicJwk, privateJwk, kid } = await generateEdDSAKeyPair();

    const tempContext = {
      ...context,
      services: {
        ...context.services,
        kek: kekService,
      },
    };

    await storeKeyPair(tempContext, kid, publicJwk, privateJwk);

    context.logger.debug("[install:post] creating default clients");
    const _appWebClientSecret = generateRandomString(32);
    const supportDeskClientSecret = generateRandomString(32);

    const supportDeskSecretEnc = await kekService.encrypt(Buffer.from(supportDeskClientSecret));

    await context.db.insert(clients).values([
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
    const existingAdmin = await context.db.query.adminUsers.findFirst({
      where: (tbl, { eq }) => eq(tbl.email, data.adminEmail),
    });

    if (!existingAdmin) {
      context.logger.error("[install:post] Admin user was not created during OPAQUE registration!");
      throw new Error("Admin user must be created via OPAQUE registration first");
    }

    const adminId = existingAdmin.id;
    context.logger.info({ adminId, email: data.adminEmail }, "[install:post] Admin user verified");

    // Verify OPAQUE record exists
    const opaqueRecord = await context.db.query.adminOpaqueRecords.findFirst({
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

    await markSystemInitialized(context);

    context.logger.info("[install:post] installation complete");

    sendJson(response, 200, {
      success: true,
      message: "Installation completed successfully",
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
    });

    context.services.kek = kekService;

    if (context.services.install) {
      context.services.install.token = undefined;
      context.services.install.createdAt = undefined;
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
