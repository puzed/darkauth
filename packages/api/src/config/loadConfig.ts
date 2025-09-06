import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export type RootConfig = {
  dbMode?: "remote" | "pglite";
  pgliteDir?: string;
  postgresUri: string;
  userPort: number;
  adminPort: number;
  proxyUi: boolean;
  kekPassphrase?: string;
};

function findConfigPath(configFile?: string): string | null {
  // If a specific config file is provided, use it
  if (configFile) {
    const resolvedPath = path.resolve(configFile);
    return fs.existsSync(resolvedPath) ? resolvedPath : null;
  }

  // Otherwise look for config.yaml in default locations
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

export function hasConfigFile(configFile?: string): boolean {
  return findConfigPath(configFile) !== null;
}

export function loadRootConfig(configFile?: string): RootConfig {
  const p = findConfigPath(configFile);
  if (!p) {
    return {
      dbMode: "remote",
      postgresUri: "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
      userPort: 9080,
      adminPort: 9081,
      proxyUi: false,
    } as RootConfig;
  }
  const raw = fs.readFileSync(p, "utf8");
  const parsed = parse(raw) as Partial<RootConfig> | null;
  if (!parsed || typeof parsed !== "object") {
    return {
      dbMode: "remote",
      postgresUri: "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
      userPort: 9080,
      adminPort: 9081,
      proxyUi: false,
    } as RootConfig;
  }
  return {
    dbMode: parsed.dbMode === "pglite" ? "pglite" : "remote",
    pgliteDir: typeof parsed.pgliteDir === "string" ? parsed.pgliteDir : undefined,
    postgresUri:
      typeof parsed.postgresUri === "string" && parsed.postgresUri.length > 0
        ? parsed.postgresUri
        : "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
    userPort: typeof parsed.userPort === "number" ? parsed.userPort : 9080,
    adminPort: typeof parsed.adminPort === "number" ? parsed.adminPort : 9081,
    proxyUi: typeof parsed.proxyUi === "boolean" ? parsed.proxyUi : false,
    kekPassphrase:
      typeof parsed.kekPassphrase === "string" && parsed.kekPassphrase.length > 0
        ? parsed.kekPassphrase
        : undefined,
  } as RootConfig;
}
