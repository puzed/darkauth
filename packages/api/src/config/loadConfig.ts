import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export type RootConfig = {
  postgresUri: string;
  userPort: number;
  adminPort: number;
  proxyUi: boolean;
  kekPassphrase?: string;
};

function findConfigPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
    path.resolve(new URL("../../..", import.meta.url).pathname, "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

export function loadRootConfig(): RootConfig {
  const p = findConfigPath();
  if (!p) throw new Error("config.yaml not found at project root");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = parse(raw) as RootConfig;
  if (!parsed || typeof parsed !== "object") throw new Error("config.yaml invalid");
  return parsed;
}
