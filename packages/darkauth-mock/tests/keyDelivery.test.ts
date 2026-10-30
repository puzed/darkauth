import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { decodeJwt } from "jose";
import { loadSigningKey, normalizeConfig } from "../src/config.ts";
import { deriveClientAppKey, deriveMockArk } from "../src/keyDelivery.ts";
import { createDarkAuthMockServer } from "../src/server.ts";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const appOrigin = "http://localhost:3000";
const redirectUri = `${appOrigin}/callback`;
const assigned: string[] = [];
const fakeLocation = {
  origin: appOrigin,
  pathname: "/callback",
  search: "",
  hash: "",
  assign(url: string) {
    assigned.push(url);
  },
};
const globals = globalThis as unknown as Record<string, unknown>;
globals.localStorage = new MemoryStorage();
globals.sessionStorage = new MemoryStorage();
globals.location = fakeLocation;
globals.window = { location: fakeLocation };
globals.history = {
  replaceState(_state: unknown, _title: string, next: string) {
    const url = new URL(next);
    fakeLocation.search = url.search;
    fakeLocation.hash = url.hash;
  },
};

const sdk = await import("../../darkauth-client/src/index.ts");

const config = normalizeConfig({
  server: { allowedOrigins: [appOrigin] },
  keySeed: "test-seed",
  clients: [
    {
      id: "mail",
      keyDelivery: "v2",
      requireOrganizationSelection: false,
      scopes: ["openid", "profile", "email", "mail:admin"],
    },
    { id: "notes", keyDelivery: "v2" },
  ],
  permissions: ["mail:admin"],
  organizations: [{ id: "acme", slug: "acme", name: "Acme" }],
  users: [
    { sub: "alice", email: "alice@example.test", name: "Alice Admin", permissions: ["mail:admin"] },
    { sub: "bob", email: "bob@example.test", name: "Bob User" },
    { sub: "olga", email: "olga@acme.test", name: "Olga Org", memberships: [{ org: "acme", roles: [] }] },
  ],
});
const server = createDarkAuthMockServer(config, await loadSigningKey());
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
  config.issuer = baseUrl;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  sdk.logout();
  assigned.length = 0;
  fakeLocation.search = "";
  fakeLocation.hash = "";
});

test("SDK signs in with v2 key delivery, refreshes, and ends the session", async () => {
  configureSdk("mail", "openid profile email mail:admin");
  const session = await signIn("alice");

  assert(session);
  assert.equal(session.keyDeliveryVersion, "v2");
  assert.equal(session.deliveredKeyKind, "client_app_key");
  const expected = await webCryptoCak(deriveMockArk("test-seed", "alice"), "alice", "client_id=mail|org_id=|aud=mail");
  assert.deepEqual(session.clientAppKey, expected);
  assert.equal(fakeLocation.hash, "");

  const access = decodeJwt(session.accessToken || "");
  assert.equal(access.token_use, "access");
  assert.equal(access.azp, "mail");
  assert.equal(access.aud, "mail");
  assert.equal(access.scope, "openid profile email mail:admin");
  assert.deepEqual(access.permissions, ["mail:admin"]);
  assert.equal(access.org_id, undefined);
  const id = decodeJwt(session.idToken);
  assert.equal(id.token_use, undefined);
  assert.equal(id.email, "alice@example.test");

  const userinfo = await fetch(`${baseUrl}/userinfo`, { headers: { authorization: `Bearer ${session.accessToken}` } });
  assert.equal(userinfo.status, 200);
  const profile = await userinfo.json();
  assert.equal(profile.sub, "alice");
  assert.equal(profile.email, "alice@example.test");
  assert.equal(profile.email_verified, true);
  assert.equal(profile.name, "Alice Admin");
  const idUserinfo = await fetch(`${baseUrl}/userinfo`, { headers: { authorization: `Bearer ${session.idToken}` } });
  assert.equal(idUserinfo.status, 401);

  const firstRefreshToken = session.refreshToken || "";
  const refreshed = await sdk.refreshSession({ force: true });
  assert(refreshed);
  assert.notEqual(refreshed.refreshToken, firstRefreshToken);
  assert.deepEqual(refreshed.clientAppKey, expected);
  assert.equal(decodeJwt(refreshed.accessToken || "").grant_type, "refresh_token");
  const replay = await refresh(firstRefreshToken);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, "invalid_grant");

  await sdk.endSession({ postLogoutRedirectUri: `${appOrigin}/`, state: "bye" });
  const logout = await fetch(assigned.at(-1) || "", { redirect: "manual" });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("location"), `${appOrigin}/?state=bye`);
  assert.equal((await refresh(refreshed.refreshToken || "")).status, 400);
});

test("users without the permission get the scope but no permission claim", async () => {
  configureSdk("mail", "openid profile email mail:admin");
  const session = await signIn("bob");
  assert(session);
  assert.deepEqual(decodeJwt(session.accessToken || "").permissions, []);
});

test("a stable ARK yields the same CAK on every sign-in", async () => {
  configureSdk("mail", "openid profile email");
  const first = await signIn("alice");
  sdk.logout();
  const second = await signIn("alice");
  assert(first?.clientAppKey?.length);
  assert.deepEqual(first?.clientAppKey, second?.clientAppKey);
});

test("rejects scopes the client does not allow", async () => {
  configureSdk("mail", "openid admin:everything");
  await sdk.initiateLogin();
  const response = await continueAs("bob");
  assert.equal(response.status, 400);
});

test("organization-scoped clients bind the CAK to the organization", async () => {
  configureSdk("notes", "openid profile");
  const session = await signIn("olga");
  assert(session);
  const expected = deriveClientAppKey(deriveMockArk("test-seed", "olga"), {
    sub: "olga",
    keyId: "mock-account-key",
    clientId: "notes",
    organizationId: "acme",
  });
  assert.deepEqual(session.clientAppKey, expected);
  assert.equal(decodeJwt(session.accessToken || "").org_id, "acme");
});

test("allows the browser app to refresh cross-origin", async () => {
  const response = await fetch(`${baseUrl}/token`, {
    method: "OPTIONS",
    headers: { origin: appOrigin, "access-control-request-method": "POST" },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), appOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

function configureSdk(clientId: string, scope: string) {
  sdk.setConfig({
    issuer: baseUrl,
    clientId,
    redirectUri,
    scope,
    zk: true,
    firstParty: false,
    tokenStorage: "localStorage",
    refreshMode: "token",
    credentials: "omit",
  });
}

async function signIn(user: string) {
  await sdk.initiateLogin();
  const authorizeUrl = assigned.at(-1) || "";
  assert(new URL(authorizeUrl).searchParams.get("zk_pub"));
  const page = await fetch(authorizeUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(`value="${user}"`));
  const response = await continueAs(user);
  assert.equal(response.status, 303, await response.text());
  const callback = new URL(response.headers.get("location") || "");
  assert.match(callback.hash, /^#darkauth_key_jwe=/);
  fakeLocation.search = callback.search;
  fakeLocation.hash = callback.hash;
  return sdk.handleCallback();
}

async function continueAs(user: string) {
  const body = new URLSearchParams(new URL(assigned.at(-1) || "").searchParams);
  body.set("user", user);
  return fetch(`${baseUrl}/authorize/continue`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function webCryptoCak(ark: Uint8Array, sub: string, info: string) {
  const salt = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`DarkAuth|v2|client-key|sub=${sub}|key_id=mock-account-key`),
  );
  const key = await crypto.subtle.importKey("raw", ark as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function refresh(refreshToken: string) {
  return fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: "mail", refresh_token: refreshToken }),
  });
}
