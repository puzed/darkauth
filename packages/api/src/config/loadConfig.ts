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

export function hasConfigFile(): boolean {
  return findConfigPath() !== null;
}

export function loadRootConfig(): RootConfig {
  const envProxy = process.env.PROXY_UI ?? process.env.ZKAUTH_PROXY_UI;
  const envProxyBool =
    typeof envProxy === "string" ? /^(1|true|yes|on)$/i.test(envProxy) : undefined;
  const p = findConfigPath();
  if (!p) {
    return {
      dbMode: "remote",
      postgresUri: "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth",
      userPort: 9080,
      adminPort: 9081,
      proxyUi: envProxyBool ?? false,
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
      proxyUi: envProxyBool ?? false,
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
    proxyUi: envProxyBool ?? (typeof parsed.proxyUi === "boolean" ? parsed.proxyUi : false),
    kekPassphrase:
      typeof parsed.kekPassphrase === "string" && parsed.kekPassphrase.length > 0
        ? parsed.kekPassphrase
        : undefined,
  } as RootConfig;
}
