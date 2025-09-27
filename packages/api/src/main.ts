import pino from "pino";
import { hasConfigFile, loadRootConfig } from "./config/loadConfig.js";
import { createContext } from "./context/createContext.js";
import { createServer } from "./createServer.js";
import { getLatestSigningKey } from "./services/jwks.js";
import { getSetting, isSystemInitialized } from "./services/settings.js";
import type { Config } from "./types.js";
import { generateRandomString } from "./utils/crypto.js";

const rootLogger = pino();

async function main() {
  const root = loadRootConfig();
  const config: Config = {
    dbMode: root.dbMode || "remote",
    pgliteDir: root.pgliteDir,
    postgresUri: root.postgresUri,
    userPort: root.userPort,
    adminPort: root.adminPort,
    proxyUi: root.proxyUi,
    kekPassphrase: root.kekPassphrase || "",
    isDevelopment: false,
    publicOrigin: `http://localhost:${root.userPort}`,
    issuer: `http://localhost:${root.userPort}`,
    rpId: "localhost",
    inInstallMode: !hasConfigFile(),
    logLevel: process.env.DARKAUTH_LOG_LEVEL ?? process.env.LOG_LEVEL,
  };

  const context = await createContext(config);
  const { logger } = context;

  try {
    const initialized = await isSystemInitialized(context);

    if (!initialized) {
      const installToken = context.config.installToken || generateRandomString(32);
      const installUrl = `http://localhost:${config.adminPort}/install?token=${installToken}`;
      logger.warn({ installUrl }, "System not initialized; setup required");
      context.services.install = { token: installToken, createdAt: Date.now() };
    } else {
      const dbIssuer = (await getSetting(context, "issuer")) as string | undefined;
      const dbPublicOrigin = (await getSetting(context, "public_origin")) as string | undefined;
      const dbRpId = (await getSetting(context, "rp_id")) as string | undefined;
      if (dbIssuer) context.config.issuer = dbIssuer;
      if (dbPublicOrigin) context.config.publicOrigin = dbPublicOrigin;
      if (dbRpId) context.config.rpId = dbRpId;
      const kekKdf = await context.db.query.settings.findFirst({
        where: (s, { eq }) => eq(s.key, "kek_kdf"),
      });
      if (kekKdf) {
        if (!config.kekPassphrase) {
          logger.fatal("KEK passphrase is required for secure operation");
          await context.destroy();
          process.exit(1);
        }
        try {
          await getLatestSigningKey(context);
        } catch {
          logger.fatal("Failed to decrypt signing key with provided KEK");
          await context.destroy();
          process.exit(1);
        }
      }
    }

    const app = await createServer(context);
    await app.start();

    logger.info(
      {
        userApi: `http://localhost:${context.config.userPort}`,
        adminApi: `http://localhost:${context.config.adminPort}`,
        mode: config.kekPassphrase ? "SECURE" : "INSECURE",
        proxyUi: context.config.proxyUi,
      },
      "DarkAuth server started"
    );

    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info({ signal }, "Shutting down");
      await app.stop();
      await context.destroy();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    await context.destroy();
    throw error;
  }
}

declare global {}

main().catch((error) => {
  rootLogger.error({ error }, "Fatal error");
  process.exit(1);
});
