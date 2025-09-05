import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

type UpdatableFields = {
  dbMode?: "remote" | "pglite";
  pgliteDir?: string;
  postgresUri?: string;
  userPort?: number;
  adminPort?: number;
  proxyUi?: boolean;
  kekPassphrase?: string;
};

function resolveConfigPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  // Default to repo root (two levels up from package) which is where config.yaml should live
  return path.resolve(process.cwd(), "..", "..", "config.yaml");
}

export function upsertConfig(updates: UpdatableFields): void {
  const p = resolveConfigPath();
  let current: Record<string, unknown> = {};
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = parse(raw);
    if (parsed && typeof parsed === "object") current = parsed as Record<string, unknown>;
  }
  const next: Record<string, unknown> = { ...current };
  if (updates.dbMode) next.dbMode = updates.dbMode;
  if (typeof updates.pgliteDir === "string") next.pgliteDir = updates.pgliteDir;
  if (typeof updates.postgresUri === "string") next.postgresUri = updates.postgresUri;
  if (typeof updates.userPort === "number") next.userPort = updates.userPort;
  if (typeof updates.adminPort === "number") next.adminPort = updates.adminPort;
  if (typeof updates.proxyUi === "boolean") next.proxyUi = updates.proxyUi;
  if (typeof updates.kekPassphrase === "string" && updates.kekPassphrase.length > 0)
    next.kekPassphrase = updates.kekPassphrase;
  const out = stringify(next);
  fs.writeFileSync(p, out, "utf8");
}
