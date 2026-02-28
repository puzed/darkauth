import pino from "pino";
import { hasConfigFile, loadRootConfig } from "./config/loadConfig.ts";
import { createContext } from "./context/createContext.ts";
import { createServer } from "./createServer.ts";
import { getLatestSigningKey } from "./services/jwks.ts";
import { getSetting, isSystemInitialized } from "./services/settings.ts";
import type { Config } from "./types.ts";
import { generateRandomString } from "./utils/crypto.ts";

const rootLogger = pino();

function printStartupPanel(urls: { installUrl?: string; adminUrl: string; userUrl: string }): void {
  const rows: Array<[string, string]> = [
    ["Install Link", urls.installUrl || "Already initialized"],
    ["Admin URL", urls.adminUrl],
    ["User URL", urls.userUrl],
  ];
  const title = "DarkAuth Links";
  const keyWidth = Math.max(...rows.map(([key]) => key.length));
  const valueWidth = Math.max(...rows.map(([, value]) => value.length));
  const contentWidth = keyWidth + valueWidth + 5;
  const top = `+${"-".repeat(contentWidth)}+`;
  const titleLine = `| ${title.padEnd(contentWidth - 2)} |`;

  process.stdout.write(`\n${top}\n`);
  process.stdout.write(`${titleLine}\n`);
  process.stdout.write(`${top}\n`);
  for (const [key, value] of rows) {
    const line = `| ${key.padEnd(keyWidth)} : ${value.padEnd(valueWidth)} |`;
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write(`${top}\n\n`);
}

async function main() {
  const root = loadRootConfig();
  const inInstallMode = !hasConfigFile();
  const config: Config = {
    dbMode: inInstallMode ? "pglite" : root.dbMode || "remote",
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
    inInstallMode,
    logLevel: process.env.DARKAUTH_LOG_LEVEL ?? process.env.LOG_LEVEL,
  };

  const context = await createContext(config);
  const { logger } = context;

  try {
    const initialized = await isSystemInitialized(context);
    let startupInstallUrl: string | undefined;

    if (!initialized) {
      const installToken = context.config.installToken || generateRandomString(32);
      const installUrl = `http://localhost:${config.adminPort}/install?token=${installToken}`;
      startupInstallUrl = installUrl;
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
    printStartupPanel({
      installUrl: startupInstallUrl,
      adminUrl: `http://localhost:${context.config.adminPort}`,
      userUrl: `http://localhost:${context.config.userPort}`,
    });

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
