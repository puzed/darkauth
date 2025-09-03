import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });

  return {
    db: drizzle(pool, { schema }),
    pool,
    async close() {
      await pool.end();
    },
  };
}
