import { lt } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import pino from "pino";
import { createPglite } from "../db/pglite.js";
import * as schema from "../db/schema.js";
import { opaqueLoginSessions } from "../db/schema.js";
import { ensureDefaultGroupAndSchema } from "../models/install.js";
import { ensureKekService } from "../services/kek.js";
import { createOpaqueService } from "../services/opaque.js";
import { cleanupExpiredSessions } from "../services/sessions.js";
import type { Config, Context, Database } from "../types.js";

async function waitForPostgres(pool: Pool, attempts = 20, delayMs = 500) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Database not ready");
}

export async function createContext(config: Config): Promise<Context> {
  const cleanupFunctions: Array<() => Promise<void> | void> = [];

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

  let pool: Pool | null = null;
  let database: Database;

  if (config.dbMode === "pglite") {
    const { db, close } = await createPglite(config.pgliteDir || "data/pglite");
    database = db;
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

    database = drizzlePg(pool, { schema });

    cleanupFunctions.push(async () => {
      await pool?.end();
    });
  }

  const services: Context["services"] = {};

  const context: Context = {
    db: database,
    config,
    services,
    logger,
    cleanupFunctions,
    async destroy() {
      for (const cleanup of cleanupFunctions) {
        await cleanup();
      }
    },
  };

  if (pool) {
    await waitForPostgres(pool);
  }

  if (!config.inInstallMode && config.kekPassphrase) {
    await ensureKekService(context);
  }

  if (!config.inInstallMode) {
    if (!config.kekPassphrase || context.services.kek?.isAvailable()) {
      try {
        services.opaque = await createOpaqueService(context);
      } catch (err) {
        logger.warn({ err }, "OPAQUE service unavailable (db not ready)");
      }
    } else {
      logger.warn("OPAQUE service unavailable (kek not ready)");
    }
  }

  if (!config.inInstallMode) {
    try {
      await ensureDefaultGroupAndSchema(context);
    } catch (err) {
      logger.warn({ err }, "ensureDefaultGroupAndSchema failed");
    }
  }

  if (!config.inInstallMode) {
    const interval = setInterval(
      async () => {
        try {
          await cleanupExpiredSessions(context);
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
