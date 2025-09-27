#!/usr/bin/env tsx
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const { Pool } = pg;

function loadDbUri(): string {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    const configuration = parse(raw) as Record<string, unknown> | undefined;
    const url: string | undefined = configuration?.postgresUri as string | undefined;
    if (url) return url;
  }
  return "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth";
}

async function wipeDatabase() {
	const postgresUri = loadDbUri();

	console.log("🗑️  Wiping database...");

	const pool = new Pool({
		connectionString: postgresUri,
	});

	type TableRow = { tablename: string };

	try {
		// Get all table names
		const tables = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

		if (tables.rows.length === 0) {
			console.log("✅ No tables found. Database is already empty.");
			return;
		}

		console.log(`Found ${tables.rows.length} tables to drop:`);
		(tables.rows as TableRow[]).forEach((row) => {
			console.log(`  - ${row.tablename}`);
		});

		// Drop all tables with CASCADE to handle foreign key constraints
		const tableNames = (tables.rows as TableRow[])
			.map((row) => `"${row.tablename}"`)
			.join(", ");
		await pool.query(`DROP TABLE IF EXISTS ${tableNames} CASCADE`);

		console.log("✅ Database wiped successfully!");
		console.log("ℹ️  Run 'npm run db:push' to recreate the schema.");
	} catch (error) {
		console.error("❌ Failed to wipe database:", error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

// Confirm before wiping
if (process.argv.includes("--force") || process.env.CI === "true") {
	wipeDatabase();
} else {
	console.log("⚠️  WARNING: This will delete ALL data in the database!");
	console.log("Press Ctrl+C to cancel, or wait 2 seconds to continue...");

	setTimeout(() => {
		wipeDatabase();
	}, 2000);
}
