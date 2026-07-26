import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { jwtVerify } from "jose";
import { loadConfig, loadSigningKey, normalizeConfig } from "../src/config.ts";
import { createDarkAuthMockServer } from "../src/server.ts";

const tmp = await mkdtemp(join(tmpdir(), "darkauth-mock-test-"));
const config = normalizeConfig({
  server: {
    port: 3020,
    issuer: "http://127.0.0.1:3020",
    allowedOrigins: ["http://localhost:3000"],
  },
  app: { name: "Atlas" },
  clients: ["atlas"],
  permissions: ["atlas:login", "atlas:admin"],
  roles: { admin: ["atlas:login", "atlas:admin"], member: ["atlas:login"] },
  organizations: [
    { id: "acme", slug: "acme", name: "Acme Corp" },
    { id: "globex", slug: "globex", name: "Globex" },
  ],
  users: [
    { sub: "ava", email: "ava@acme.test", name: "Ava Admin", memberships: [{ org: "acme", roles: ["admin"] }] },
    {
      sub: "cara",
      email: "cara@cross.test",
      name: "Cara Cross",
      memberships: [
        { org: "acme", roles: ["member"] },
        { org: "globex", roles: ["admin"] },
      ],
    },
  ],
});
const signingKey = await loadSigningKey();
const server = createDarkAuthMockServer(config, signingKey);
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("uses a generic built-in config when no file is supplied", async () => {
  const fallback = await loadConfig({});
  assert.equal(fallback.appName, "the app");
  assert.deepEqual(fallback.clients, ["local"]);
  assert.doesNotMatch(JSON.stringify(fallback), /atlas/i);
});

test("adds and reuses the signing key in the YAML config", async () => {
  const configPath = join(tmp, "persistent.yaml");
  await writeFile(configPath, "app:\n  name: Persistent App\n");

  const first = await loadSigningKey(configPath);
  const saved = await readFile(configPath, "utf8");
  const second = await loadSigningKey(configPath);

  assert.match(saved, /name: Persistent App/);
  assert.match(saved, /signingKey:/);
  assert.match(saved, /d:/);
  assert.deepEqual(second.publicJwk, first.publicJwk);
});

test("serves discovery and JWKS for OIDC verification", async () => {
  const discovery = await getJson("/.well-known/openid-configuration");
  assert.equal(discovery.issuer, "http://127.0.0.1:3020");
  assert.equal(discovery.authorization_endpoint, "http://127.0.0.1:3020/authorize");

  const jwks = await getJson("/.well-known/jwks.json");
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].alg, "EdDSA");
  assert.equal(jwks.keys[0].kid, "darkauth-mock-dev-ed25519");
});

test("renders demo users grouped by organization", async () => {
  const page = await (await fetch(`${baseUrl}/authorize?client_id=atlas`)).text();
  assert.match(page, /Choose a local Atlas identity/);
  assert.match(page, /Acme Corp/);
  assert.match(page, /Globex/);
  assert.match(page, /Ava Admin/);
  assert.match(page, /Cara Cross/);
});

test("signs in a demo user and resolves role permissions", async () => {
  const tokenSet = await login({ user: "ava", organization_id: "acme" });
  const claims = await verify(tokenSet.id_token);
  assert.equal(claims.sub, "ava");
  assert.equal(claims.email, "ava@acme.test");
  assert.equal(claims.org_id, "acme");
  assert.equal(claims.org_slug, "acme");
  assert.deepEqual(claims.roles, ["admin"]);
  assert.deepEqual(claims.permissions, ["atlas:login", "atlas:admin"]);
});

test("custom identity unions role and checked permissions", async () => {
  const tokenSet = await login({
    sub: "custom-user",
    email: "custom@example.test",
    name: "Custom User",
    organization_id: "acme",
    roles: ["member"],
    permissions: ["atlas:admin"],
  });
  const claims = await verify(tokenSet.id_token);
  assert.equal(claims.sub, "custom-user");
  assert.equal(claims.org_id, "acme");
  assert.deepEqual(claims.permissions, ["atlas:login", "atlas:admin"]);
});

test("rejects unknown clients", async () => {
  const response = await fetch(`${baseUrl}/authorize/continue`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "not-registered",
      redirect_uri: "http://localhost:3000/callback",
      state: randomUUID(),
      code_challenge: "x",
      user: "ava",
      organization_id: "acme",
    }),
  });
  assert.equal(response.status, 400);
});

test("rejects malformed bearer headers without expensive matching", async () => {
  const response = await fetch(`${baseUrl}/api/user/session`, {
    headers: { authorization: `Bearer ${" ".repeat(100_000)}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("multi-org user keeps organizations and can switch active org", async () => {
  const tokenSet = await login({ user: "cara", organization_id: "acme" });

  const orgs = await fetch(`${baseUrl}/api/user/organizations`, {
    headers: { authorization: `Bearer ${tokenSet.access_token}` },
  });
  const orgBody = await orgs.json();
  assert.deepEqual(
    orgBody.organizations.map((org: { organizationId: string }) => org.organizationId),
    ["acme", "globex"],
  );

  const switched = await fetch(`${baseUrl}/api/token/organization`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokenSet.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ client_id: "atlas", organization_id: "globex" }),
  });
  assert.equal(switched.status, 200);
  const claims = await verify((await switched.json()).id_token);
  assert.equal(claims.org_id, "globex");
  assert.deepEqual(claims.permissions, ["atlas:login", "atlas:admin"]);

  const refresh = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: "atlas", refresh_token: tokenSet.refresh_token }),
  });
  assert.equal(refresh.status, 200);
  assert.equal(typeof (await refresh.json()).id_token, "string");
});

async function login(fields: Record<string, string | string[]>) {
  const verifier = "test-verifier";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = "http://localhost:3000/callback";
  const body = new URLSearchParams({
    client_id: "atlas",
    redirect_uri: redirectUri,
    state: randomUUID(),
    code_challenge: challenge,
  });
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  const authorize = await fetch(`${baseUrl}/authorize/continue`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(authorize.status, 303, await authorize.text());
  const location = new URL(authorize.headers.get("location") || "");
  const response = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: location.searchParams.get("code") || "",
      client_id: "atlas",
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function verify(token: string) {
  const result = await jwtVerify(token, signingKey.publicKey, {
    issuer: config.issuer,
    audience: "atlas",
    algorithms: ["EdDSA"],
  });
  return result.payload as Record<string, unknown>;
}

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}
