import { hasConfigFile, loadRootConfig } from "./config/loadConfig.js";
import "./reload.js";
import { createContext } from "./context/createContext.js";
import { createAdminServer, createUserServer } from "./http/createServer.js";
import { getLatestSigningKey } from "./services/jwks.js";
import { getSetting, isSystemInitialized } from "./services/settings.js";
import type { Config } from "./types.js";
import { generateRandomString } from "./utils/crypto.js";
import { printBox, printInfoTable } from "./utils/terminal.js";

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
    isDevelopment: process.env.NODE_ENV !== "production",
    publicOrigin: `http://localhost:${root.userPort}`,
    issuer: `http://localhost:${root.userPort}`,
    rpId: "localhost",
    inInstallMode: !hasConfigFile(),
  };

  const context = await createContext(config);

  try {
    const initialized = await isSystemInitialized(context);

    if (!initialized) {
      const installToken = generateRandomString(32);
      const installUrl = `http://localhost:${config.adminPort}/install?token=${installToken}`;

      printBox([
        "DarkAuth - First Run Setup",
        "",
        "System is not initialized. Please complete setup:",
        `Install URL: ${installUrl}`,
        "",
        "This token expires in 10 minutes.",
      ]);

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
          printBox([
            "DarkAuth - Secure Mode",
            "",
            "KEK passphrase is required for secure operation.",
            "Please provide KEK passphrase via:",
            "- ZKAUTH_KEK_PASSPHRASE or KEK_PASSPHRASE environment variable",
          ]);
          process.exit(1);
        }
        try {
          await getLatestSigningKey(context);
        } catch {
          printBox([
            "DarkAuth - Invalid KEK",
            "",
            "Failed to decrypt signing key with provided KEK.",
            "Ensure ZKAUTH_KEK_PASSPHRASE matches the one used at install.",
          ]);
          process.exit(1);
        }
      }
    }

    const userServer = await createUserServer(context);
    const adminServer = await createAdminServer(context);

    userServer.listen(config.userPort, () => {
      console.log(`User/OIDC server listening on port ${config.userPort}`);
    });

    adminServer.listen(config.adminPort, () => {
      console.log(`Admin server listening on port ${config.adminPort}`);
    });

    printInfoTable("DarkAuth v1.0.0", [
      ["User/OIDC API:", `http://localhost:${config.userPort}`],
      ["Admin API:", `http://localhost:${config.adminPort}`],
      ["Mode:", "SECURE"],
      ["UI Proxy:", config.proxyUi ? "ENABLED" : "DISABLED"],
    ]);

    process.on("SIGINT", async () => {
      console.log("\nShutting down gracefully...");
      userServer.close();
      adminServer.close();
      await context.destroy();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nShutting down gracefully...");
      userServer.close();
      adminServer.close();
      await context.destroy();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    await context.destroy();
    process.exit(1);
  }
}

declare global {}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", "..", ".env") });
