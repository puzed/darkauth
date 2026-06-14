import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

type DiscoveryMetadata = Record<string, unknown>;

const assigned: string[] = [];
let discovery: DiscoveryMetadata | null = null;
let discoveryStatusOk = true;

const fakeLocation = {
  origin: "https://app.example.com",
  pathname: "/",
  href: "https://app.example.com/",
  hash: "",
  search: "",
  assign(url: string): void {
    assigned.push(url);
  },
};

const globals = globalThis as unknown as Record<string, unknown>;
globals.localStorage = new MemoryStorage();
globals.sessionStorage = new MemoryStorage();
globals.location = fakeLocation;
globals.window = { location: fakeLocation };
globals.fetch = async (input: unknown): Promise<unknown> => {
  const url = String(input);
  if (url.includes("/.well-known/openid-configuration")) {
    return {
      ok: discoveryStatusOk,
      json: async () => discovery ?? {},
    };
  }
  throw new Error(`unexpected fetch: ${url}`);
};

const { setConfig, endSession, logout } = await import("./index.js");

const ISSUER = "https://auth.example.com";
const ID_TOKEN = "header.payload.signature";

beforeEach(() => {
  assigned.length = 0;
  discovery = null;
  discoveryStatusOk = true;
  (globals.localStorage as MemoryStorage).clear();
  (globals.sessionStorage as MemoryStorage).clear();
  logout();
});

function seedStoredIdToken(): void {
  setConfig({ issuer: ISSUER, clientId: "atlas", tokenStorage: "localStorage" });
  (globals.localStorage as MemoryStorage).setItem("id_token", ID_TOKEN);
}

test("endSession redirects to discovery end_session_endpoint with all params and clears local session", async () => {
  discovery = { end_session_endpoint: `${ISSUER}/api/logout` };
  seedStoredIdToken();

  await endSession({
    postLogoutRedirectUri: "https://app.example.com/login",
    state: "xyz",
  });

  assert.equal(assigned.length, 1);
  const url = new URL(assigned[0] as string);
  assert.equal(url.origin + url.pathname, `${ISSUER}/api/logout`);
  assert.equal(url.searchParams.get("id_token_hint"), ID_TOKEN);
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), "https://app.example.com/login");
  assert.equal(url.searchParams.get("client_id"), "atlas");
  assert.equal(url.searchParams.get("state"), "xyz");
  assert.equal((globals.localStorage as MemoryStorage).getItem("id_token"), null);
});

test("endSession falls back to issuer /api/logout when discovery omits end_session_endpoint", async () => {
  discovery = { authorization_endpoint: `${ISSUER}/authorize` };
  seedStoredIdToken();

  await endSession({ postLogoutRedirectUri: "https://app.example.com/login" });

  const url = new URL(assigned[0] as string);
  assert.equal(url.origin + url.pathname, `${ISSUER}/api/logout`);
});

test("endSession uses configured endSessionEndpoint override without discovery", async () => {
  setConfig({
    issuer: ISSUER,
    clientId: "atlas",
    tokenStorage: "localStorage",
    endSessionEndpoint: "https://auth.example.com/custom/logout",
    discovery: false,
  });
  (globals.localStorage as MemoryStorage).setItem("id_token", ID_TOKEN);

  await endSession({ idTokenHint: ID_TOKEN });

  const url = new URL(assigned[0] as string);
  assert.equal(url.origin + url.pathname, "https://auth.example.com/custom/logout");
});

test("endSession omits client_id and post_logout_redirect_uri when no redirect uri given", async () => {
  discovery = { end_session_endpoint: `${ISSUER}/api/logout` };
  seedStoredIdToken();

  await endSession({ idTokenHint: ID_TOKEN });

  const url = new URL(assigned[0] as string);
  assert.equal(url.searchParams.get("id_token_hint"), ID_TOKEN);
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), null);
  assert.equal(url.searchParams.get("client_id"), null);
});

test("endSession uses explicit clientId override when provided", async () => {
  discovery = { end_session_endpoint: `${ISSUER}/api/logout` };
  seedStoredIdToken();

  await endSession({
    postLogoutRedirectUri: "https://app.example.com/login",
    clientId: "other-client",
    idTokenHint: ID_TOKEN,
  });

  const url = new URL(assigned[0] as string);
  assert.equal(url.searchParams.get("client_id"), "other-client");
});

test("logout clears local session without redirecting", () => {
  seedStoredIdToken();

  logout();

  assert.equal(assigned.length, 0);
  assert.equal((globals.localStorage as MemoryStorage).getItem("id_token"), null);
});
