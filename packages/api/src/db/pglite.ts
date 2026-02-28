import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema.ts";

export async function createPglite(dir: string) {
  const abs = path.resolve(process.cwd(), dir);
  fs.mkdirSync(abs, { recursive: true });
  const client = await PGlite.create(abs);
  const db = drizzle(client, { schema });
  const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;
  await migratePglite(db as import("drizzle-orm/pglite").PgliteDatabase<typeof schema>, {
    migrationsFolder,
  });
  const close = async () => {
    try {
      await client.close();
    } catch {}
  };
  return { db, client, close };
}
