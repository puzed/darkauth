import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

function loadDbUrl(): string {
  // First check for DATABASE_URL environment variable (for tests)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
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

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: loadDbUrl(),
	},
});
