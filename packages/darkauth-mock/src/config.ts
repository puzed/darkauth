import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exportJWK, generateKeyPair, importJWK, type CryptoKey, type JWK } from "jose";
import YAML from "yaml";

export type MockOrganization = {
  id: string;
  slug: string;
  name: string;
};

export type MockMembership = {
  org: string;
  roles: string[];
  permissions: string[];
};

export type MockUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  memberships: MockMembership[];
};

export type MockConfig = {
  host: string;
  port: number;
  issuer: string;
  allowedOrigins: string[];
  appName: string;
  clients: string[];
  permissions: string[];
  roles: Record<string, string[]>;
  organizations: MockOrganization[];
  users: MockUser[];
};

export type SigningKey = {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
};

const DEFAULT_CONFIG: MockConfig = {
  host: "0.0.0.0",
  port: 3020,
  issuer: "http://localhost:3020",
  allowedOrigins: ["http://localhost:3000", "http://localhost:5173"],
  appName: "the app",
  clients: ["local"],
  permissions: ["login", "admin"],
  roles: { admin: ["login", "admin"], member: ["login"] },
  organizations: [{ id: "local-org", slug: "local", name: "Local Development" }],
  users: [
    {
      sub: "local-developer",
      email: "developer@example.test",
      name: "Local Developer",
      memberships: [{ org: "local-org", roles: ["admin"], permissions: [] }],
    },
  ],
};

export async function loadConfig(env = process.env): Promise<MockConfig> {
  const configPath = env.DARKAUTH_MOCK_CONFIG;
  if (!configPath) return DEFAULT_CONFIG;
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return DEFAULT_CONFIG;
    throw error;
  }
  return normalizeConfig(YAML.parse(raw), DEFAULT_CONFIG);
}

export function normalizeConfig(input: unknown, base: MockConfig = DEFAULT_CONFIG): MockConfig {
  const root = asRecord(input);
  const server = asRecord(root.server);
  const app = asRecord(root.app);

  const port = toPositiveInt(server.port, base.port);
  const issuer = trimTrailingSlash(asString(server.issuer) || base.issuer);
  const allowedOrigins = toStringArray(server.allowedOrigins);

  const organizations = Array.isArray(root.organizations)
    ? root.organizations.map(toOrganization).filter((org): org is MockOrganization => org !== null)
    : base.organizations;

  const roles = toRoles(root.roles) ?? base.roles;
  const permissions = Array.isArray(root.permissions) ? toStringArray(root.permissions) : base.permissions;

  const users = Array.isArray(root.users)
    ? root.users.map((user) => toUser(user, organizations)).filter((user): user is MockUser => user !== null)
    : base.users;

  return {
    host: asString(server.host) || base.host,
    port,
    issuer,
    allowedOrigins: allowedOrigins.length ? allowedOrigins : base.allowedOrigins,
    appName: asString(app.name) || base.appName,
    clients: dedupe(toStringArray(root.clients)) || base.clients,
    permissions,
    roles,
    organizations: organizations.length ? organizations : base.organizations,
    users,
  };
}

export function resolveMembership(config: MockConfig, membership: MockMembership) {
  const organization = config.organizations.find((org) => org.id === membership.org);
  if (!organization) throw new Error(`Unknown organization: ${membership.org}`);
  const fromRoles = membership.roles.flatMap((role) => config.roles[role] ?? []);
  const permissions = dedupe([...fromRoles, ...membership.permissions]) ?? [];
  return {
    organizationId: organization.id,
    slug: organization.slug,
    name: organization.name,
    status: "active" as const,
    roles: membership.roles,
    permissions,
  };
}

export async function loadSigningKey(configPath?: string): Promise<SigningKey> {
  const kid = "darkauth-mock-dev-ed25519";
  let privateJwk = configPath ? await readSigningKey(configPath) : undefined;
  if (!privateJwk) {
    privateJwk = await generateSigningJwk(kid);
    if (configPath) await writeSigningKey(configPath, privateJwk);
  }

  const privateKey = requireCryptoKey(await importJWK(privateJwk, "EdDSA"));
  const publicJwk = publicJwkFromPrivate(privateJwk, kid);
  const publicKey = requireCryptoKey(await importJWK(publicJwk, "EdDSA"));
  return { kid, privateKey, publicKey, publicJwk };
}

async function readSigningKey(configPath: string): Promise<JWK | undefined> {
  try {
    const root = asRecord(YAML.parse(await readFile(configPath, "utf8")));
    const signingKey = asRecord(root.signingKey);
    return Object.keys(signingKey).length ? (signingKey as JWK) : undefined;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function generateSigningJwk(kid: string): Promise<JWK> {
  const { privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  privateJwk.kid = kid;
  privateJwk.alg = "EdDSA";
  privateJwk.use = "sig";
  return privateJwk;
}

async function writeSigningKey(configPath: string, privateJwk: JWK) {
  let raw = "";
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  const document = YAML.parseDocument(raw);
  document.set("signingKey", privateJwk);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, document.toString(), { mode: 0o600 });
}

function toOrganization(value: unknown): MockOrganization | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const slug = asString(record.slug) || id;
  return { id, slug, name: asString(record.name) || titleize(slug) };
}

function toRoles(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const roles: Record<string, string[]> = {};
  for (const [name, permissions] of Object.entries(value as Record<string, unknown>)) {
    roles[name] = toStringArray(permissions);
  }
  return roles;
}

function toUser(value: unknown, organizations: MockOrganization[]): MockUser | null {
  const record = asRecord(value);
  const sub = asString(record.sub);
  if (!sub) return null;
  const email = asString(record.email) || `${sub}@example.test`;
  const memberships = Array.isArray(record.memberships)
    ? record.memberships
        .map((membership) => toMembership(membership, organizations))
        .filter((membership): membership is MockMembership => membership !== null)
    : [];
  const picture = asString(record.picture);
  return {
    sub,
    email,
    name: asString(record.name) || email,
    ...(picture ? { picture } : {}),
    memberships,
  };
}

function toMembership(value: unknown, organizations: MockOrganization[]): MockMembership | null {
  const record = asRecord(value);
  const org = asString(record.org);
  if (!org || !organizations.some((candidate) => candidate.id === org)) return null;
  return { org, roles: toStringArray(record.roles), permissions: toStringArray(record.permissions) };
}

function requireCryptoKey(key: CryptoKey | Uint8Array): CryptoKey {
  if (key instanceof Uint8Array) throw new Error("DarkAuth Mock EdDSA key import did not return a CryptoKey");
  return key;
}

function publicJwkFromPrivate(privateJwk: JWK, kid: string): JWK {
  if (!privateJwk.kty || !privateJwk.crv || !privateJwk.x) {
    throw new Error("DarkAuth Mock signing key is not an Ed25519 JWK");
  }
  return { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, kid, alg: "EdDSA", use: "sig" };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function dedupe(values: string[]): string[] | undefined {
  const result = [...new Set(values)];
  return result.length ? result : undefined;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function titleize(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
