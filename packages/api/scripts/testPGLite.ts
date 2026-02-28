#!/usr/bin/env node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "../src/db/schema.ts";

async function main() {
  const dir = path.resolve(process.cwd(), "data/pglite-test");
  fs.mkdirSync(dir, { recursive: true });

  const client = new PGlite(dir);
  const db = drizzle(client, { schema });

  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  await migrate(db as any, { migrationsFolder });

  await db.insert(schema.settings).values({
    key: "pglite_probe",
    value: { ok: true },
    secure: false,
  }).onConflictDoNothing();

  const row = await db.query.settings.findFirst({
    where: (tbl, { eq }) => eq(tbl.key, "pglite_probe"),
  });

  console.log("pglite ok", !!row);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
