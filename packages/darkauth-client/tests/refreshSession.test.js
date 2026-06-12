import { test } from "node:test";
import assert from "node:assert/strict";
import { logout, refreshSession, setConfig } from "../dist/index.js";

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    key(index) {
      return Array.from(entries.keys())[index] || null;
    },
    get length() {
      return entries.size;
    },
  };
}

function setupEnvironment(config = {}) {
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  logout();
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: true,
    discovery: false,
    firstParty: false,
    ...config,
  });
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createIdToken(sub = "user-1") {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  return `${header}.${payload}.sig`;
}

test("refreshSession does not clear refresh token on server errors in token mode", async () => {
  setupEnvironment();
  globalThis.localStorage.setItem("refresh_token", "rt-1");
  globalThis.fetch = async () => ({ ok: false, status: 500 });

  const result = await refreshSession();

  assert.equal(result, null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-1");
});

test("refreshSession clears refresh token on 401 in token mode", async () => {
  setupEnvironment();
  globalThis.localStorage.setItem("refresh_token", "rt-2");
  globalThis.fetch = async () => ({ ok: false, status: 401 });

  const result = await refreshSession();

  assert.equal(result, null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), null);
});

test("refreshSession keeps a newer refresh token on 401 in token mode", async () => {
  setupEnvironment();
  globalThis.localStorage.setItem("refresh_token", "rt-3");
  globalThis.fetch = async () => {
    globalThis.localStorage.setItem("refresh_token", "rt-4");
    return { ok: false, status: 401 };
  };

  const result = await refreshSession();

  assert.equal(result, null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-4");
});

test("refreshSession force refreshes even when stored id token is still valid", async () => {
  setupEnvironment({ tokenStorage: "localStorage" });
  const existingToken = createIdToken("user-1");
  const refreshedToken = createIdToken("user-2");
  globalThis.localStorage.setItem("id_token", existingToken);
  globalThis.localStorage.setItem("refresh_token", "rt-5");
  let fetchCalls = 0;
  globalThis.fetch = async (_url, init) => {
    fetchCalls += 1;
    assert.equal(init.body.get("refresh_token"), "rt-5");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id_token: refreshedToken,
        access_token: "at-5",
        refresh_token: "rt-6",
      }),
    };
  };

  const cached = await refreshSession();
  const refreshed = await refreshSession({ force: true });

  assert.equal(fetchCalls, 1);
  assert.equal(cached.idToken, existingToken);
  assert.equal(refreshed.idToken, refreshedToken);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-6");
});

test("refreshSession prefers the latest localStorage refresh token over stale memory in token mode", async () => {
  setupEnvironment({ tokenStorage: "localStorage" });
  const firstToken = createIdToken("user-1");
  const secondToken = createIdToken("user-2");
  globalThis.localStorage.setItem("refresh_token", "rt-memory");
  let fetchCalls = 0;
  globalThis.fetch = async (_url, init) => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      assert.equal(init.body.get("refresh_token"), "rt-memory");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id_token: firstToken,
          access_token: "at-1",
          refresh_token: "rt-memory-next",
        }),
      };
    }

    assert.equal(init.body.get("refresh_token"), "rt-other-tab");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id_token: secondToken,
        access_token: "at-2",
        refresh_token: "rt-final",
      }),
    };
  };

  await refreshSession({ force: true });
  globalThis.localStorage.setItem("refresh_token", "rt-other-tab");
  const refreshed = await refreshSession({ force: true });

  assert.equal(fetchCalls, 2);
  assert.equal(refreshed.idToken, secondToken);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-final");
});
