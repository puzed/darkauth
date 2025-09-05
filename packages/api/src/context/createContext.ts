import { eq, lt } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import pino from "pino";
import { createPglite } from "../db/pglite.js";
import * as schema from "../db/schema.js";
import { opaqueLoginSessions, settings } from "../db/schema.js";
import { createKekService } from "../services/kek.js";
import { createOpaqueService } from "../services/opaque.js";
import { cleanupExpiredSessions } from "../services/sessions.js";
import type { Config, Context, Database, KdfParams } from "../types.js";

export async function createContext(config: Config): Promise<Context> {
  const cleanupFunctions: Array<() => Promise<void> | void> = [];

  // Create logger with configured level
  const logger = pino({
    level: config.logLevel || "info",
    transport: config.isDevelopment
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        }
      : undefined,
  });

  let db!: Database;
  let pool: Pool | null = null;
  if (!config.inInstallMode) {
    if (config.dbMode === "pglite") {
      const { db: pdb, close } = await createPglite(config.pgliteDir || "data/pglite");
      db = pdb;
      cleanupFunctions.push(async () => {
        await close();
      });
    } else {
      pool = new Pool({
        connectionString: config.postgresUri,
        keepAlive: true,
      });

      pool.on("error", (err) => {
        logger.error({ err }, "Database pool error");
      });

      db = drizzlePg(pool, { schema });

      cleanupFunctions.push(async () => {
        await pool?.end();
      });
    }
  }

  let kekService = undefined as Context["services"]["kek"] | undefined;
  if (!config.inInstallMode && config.kekPassphrase) {
    try {
      const kdf = await db.query.settings.findFirst({ where: eq(settings.key, "kek_kdf") });
      const params = (kdf?.value as KdfParams | undefined) || undefined;
      if (params) {
        kekService = await createKekService(config.kekPassphrase, params);
      }
    } catch (err) {
      logger.warn({ err }, "KEK service unavailable (db not ready)");
    }
  }

  const tempContext: Context = {
    db,
    config,
    services: { kek: kekService },
    logger,
    cleanupFunctions,
    async destroy() {
      for (const cleanup of cleanupFunctions) await cleanup();
    },
  };

  let opaqueService = undefined as Context["services"]["opaque"] | undefined;
  if (!config.inInstallMode) {
    try {
      opaqueService = await createOpaqueService(tempContext);
    } catch (err) {
      logger.warn({ err }, "OPAQUE service unavailable (db not ready)");
    }
  }

  const context: Context = {
    db,
    config,
    services: {
      kek: kekService,
      opaque: opaqueService,
    },
    logger,
    cleanupFunctions,
    async destroy() {
      for (const cleanup of cleanupFunctions) {
        await cleanup();
      }
    },
  };

  if (!config.inInstallMode) {
    const interval = setInterval(
      async () => {
        try {
          await cleanupExpiredSessions({ ...context, services: context.services });
          await context.db
            .delete(opaqueLoginSessions)
            .where(lt(opaqueLoginSessions.expiresAt, new Date()));
        } catch {}
      },
      15 * 60 * 1000
    );
    cleanupFunctions.push(() => clearInterval(interval));
  }

  return context;
}
