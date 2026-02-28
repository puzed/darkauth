import type { Server } from "node:http";
import type { Socket } from "node:net";
import { hasConfigFile, loadRootConfig } from "./config/loadConfig.ts";
import { createContext } from "./context/createContext.ts";
import { createAdminServer, createUserServer } from "./http/createServer.ts";
import { getLatestSigningKey } from "./services/jwks.ts";
import { getSetting, isSystemInitialized } from "./services/settings.ts";
import type { Config, Context } from "./types.ts";
import { generateRandomString } from "./utils/crypto.ts";

export type AppServer = {
  userServer: Server;
  adminServer: Server;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  getContext: () => Context;
};

export async function createServer(initialContext: Context): Promise<AppServer> {
  let context = initialContext;
  let userServer = await createUserServer(context);
  let adminServer = await createAdminServer(context);
  const userSockets = new Set<Socket>();
  const adminSockets = new Set<Socket>();
  userServer.on("connection", (s) => {
    userSockets.add(s);
    s.on("close", () => userSockets.delete(s));
  });
  adminServer.on("connection", (s) => {
    adminSockets.add(s);
    s.on("close", () => adminSockets.delete(s));
  });

  const waitClose = (s: Server) =>
    new Promise<void>((resolve) => {
      s.close(() => resolve());
    });

  const start = async () => {
    try {
      const initialized = await isSystemInitialized(context);
      if (!initialized && !context.services.install?.token) {
        const token = context.config.installToken || generateRandomString(32);
        context.services.install = {
          ...(context.services.install || {}),
          token,
          createdAt: Date.now(),
        };
      }
    } catch {}
    await new Promise<void>((resolve) => {
      userServer.listen(context.config.userPort, () => resolve());
    });
    await new Promise<void>((resolve) => {
      adminServer.listen(context.config.adminPort, () => resolve());
    });
  };

  const stop = async () => {
    const toClose: Server[] = [];
    if (userServer.listening) toClose.push(userServer);
    if (adminServer.listening) toClose.push(adminServer);
    for (const s of toClose) {
      try {
        s.close();
      } catch {}
    }
    for (const s of [...userSockets])
      try {
        s.destroy();
      } catch {}
    for (const s of [...adminSockets])
      try {
        s.destroy();
      } catch {}
    for (const s of toClose) await waitClose(s);
    await context.destroy();
  };

  const restart = async () => {
    await stop();
    const root = loadRootConfig(context.config.configFile);
    const hasConfig = hasConfigFile(context.config.configFile);
    const chosenDbMode = context.services.install?.chosenDbMode;
    const chosenPgliteDir = context.services.install?.chosenPgliteDir;
    const chosenPostgresUri = context.services.install?.chosenPostgresUri;
    const userPort = context.config.userPort;
    const adminPort = context.config.adminPort;
    const nextConfig: Config = {
      dbMode: hasConfig ? root.dbMode || chosenDbMode || "remote" : chosenDbMode || "pglite",
      pgliteDir: root.pgliteDir || chosenPgliteDir,
      postgresUri: root.postgresUri || chosenPostgresUri || context.config.postgresUri,
      userPort,
      adminPort,
      proxyUi: root.proxyUi ?? context.config.proxyUi,
      kekPassphrase: (root.kekPassphrase ?? context.config.kekPassphrase) || "",
      isDevelopment: context.config.isDevelopment,
      publicOrigin: `http://localhost:${userPort}`,
      issuer: `http://localhost:${userPort}`,
      rpId: "localhost",
      insecureKeys: context.config.insecureKeys,
      logLevel: context.config.logLevel,
      inInstallMode: !hasConfig,
      configFile: context.config.configFile,
    };
    context = await createContext(nextConfig);
    try {
      const initialized = await isSystemInitialized(context);
      if (initialized) {
        const dbIssuer = (await getSetting(context, "issuer")) as string | undefined;
        const dbPublicOrigin = (await getSetting(context, "public_origin")) as string | undefined;
        const dbRpId = (await getSetting(context, "rp_id")) as string | undefined;
        if (dbIssuer) context.config.issuer = dbIssuer;
        if (dbPublicOrigin) context.config.publicOrigin = dbPublicOrigin;
        if (dbRpId) context.config.rpId = dbRpId;
        const kekKdf = await context.db.query.settings.findFirst({
          where: (s, { eq }) => eq(s.key, "kek_kdf"),
        });
        if (kekKdf && context.config.kekPassphrase) {
          try {
            await getLatestSigningKey(context);
          } catch {}
        }
      }
    } catch {}
    context.restart = restart;
    try {
      const { count } = await import("drizzle-orm");
      const { adminUsers } = await import("./db/schema.ts");
      const c = await context.db.select({ c: count() }).from(adminUsers);
      context.logger.info(
        {
          ready: true,
          dbMode: context.config.dbMode,
          pgliteDir: context.config.pgliteDir,
          adminCount: c[0]?.c ?? 0,
        },
        "[restart] server ready"
      );
    } catch {}
    userServer = await createUserServer(context);
    adminServer = await createAdminServer(context);
    userSockets.clear();
    adminSockets.clear();
    userServer.on("connection", (s) => {
      userSockets.add(s);
      s.on("close", () => userSockets.delete(s));
    });
    adminServer.on("connection", (s) => {
      adminSockets.add(s);
      s.on("close", () => adminSockets.delete(s));
    });
    await start();
  };

  context.restart = restart;

  return {
    getContext: () => context,
    userServer,
    adminServer,
    start,
    stop,
    restart,
  };
}
