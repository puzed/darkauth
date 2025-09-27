import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import pino from "pino";
import { loadRootConfig } from "../config/loadConfig.js";
import * as schema from "./schema.js";

const logger = pino();

async function runMigrations() {
  const connectionString = loadRootConfig().postgresUri;

  logger.info("Connecting to database");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    logger.info("Running migrations");
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.info("Migrations completed successfully");
  } catch (error) {
    logger.error({ error }, "Migration failed");
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  logger.error({ error }, "Migration process failed");
  process.exit(1);
});
