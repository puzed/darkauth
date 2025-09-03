import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadRootConfig } from "../config/loadConfig.js";
import * as schema from "./schema.js";

async function runMigrations() {
  const connectionString = loadRootConfig().postgresUri;

  console.log("Connecting to database...");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations().catch(console.error);
