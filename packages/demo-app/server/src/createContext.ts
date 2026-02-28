import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { PGlite } from "@electric-sql/pglite";
import type { Context, Logger } from "./types.ts";

function loadConfigFile(): { postgresUri?: string; api?: { issuer?: string } } {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return parse(fs.readFileSync(p, "utf8")) as any;
  return {};
}

async function createDb() {
  const pgliteDir = path.resolve(process.cwd(), "./data/demo-pglite");
  fs.mkdirSync(pgliteDir, { recursive: true });
  const db = await PGlite.create(pgliteDir);
  return db;
}

export async function createContext(): Promise<Context> {
  const configuration = loadConfigFile();
  const port = 9094;
  const issuer = configuration?.api?.issuer || "http://localhost:9080";
  const logger: Logger = {
    info: (msg, data) => process.stdout.write(`[demo] ${msg}${data ? ` ${JSON.stringify(data)}` : ""}\n`),
    error: (msg, data) => process.stderr.write(`[demo] ${msg}${data ? ` ${JSON.stringify(data)}` : ""}\n`),
  };
  const db = await createDb();
  return { db, logger, config: { port, issuer } };
}
