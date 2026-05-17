import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCallback, getStoredSession, logout, refreshSession, setConfig } from "../dist/index.js";

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

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createIdToken() {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: "user-1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  return `${header}.${payload}.sig`;
}

function setupEnvironment(config = {}) {
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  globalThis.history = { replaceState() {} };
  globalThis.location = {
    search: "?code=abc&state=state-1",
    hash: "",
    origin: "https://app.example",
    pathname: "/callback",
  };
  logout();
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: false,
    discovery: false,
    firstParty: true,
    ...config,
  });
  globalThis.sessionStorage.setItem("oauth_state", "state-1");
}

test("handleCallback keeps default first-party non-zk tokens out of localStorage", async () => {
  setupEnvironment();
  const idToken = createIdToken();
  globalThis.sessionStorage.setItem("pkce_verifier", "pkce-verifier");
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.credentials, "include");
    return {
      ok: true,
      json: async () => ({
        id_token: idToken,
        access_token: "at-1",
        refresh_token: "rt-1",
      }),
    };
  };

  const session = await handleCallback();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.accessToken, "at-1");
  assert.equal(session.drk.length, 0);
  assert.equal(session.refreshToken, undefined);
  assert.equal(globalThis.localStorage.getItem("id_token"), null);
  assert.equal(globalThis.localStorage.getItem("access_token"), null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), null);
  assert.equal(globalThis.localStorage.getItem("drk_protected"), null);
  assert.equal(globalThis.sessionStorage.getItem("oauth_state"), null);
  assert.equal(globalThis.sessionStorage.getItem("pkce_verifier"), null);
  assert.equal(getStoredSession(), session);
});

test("handleCallback can use legacy localStorage token mode", async () => {
  setupEnvironment({ firstParty: false });
  const idToken = createIdToken();
  globalThis.sessionStorage.setItem("pkce_verifier", "pkce-verifier");
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      id_token: idToken,
      access_token: "at-legacy",
      refresh_token: "rt-legacy",
    }),
  });

  const session = await handleCallback();

  assert.ok(session);
  assert.equal(session.refreshToken, "rt-legacy");
  assert.equal(globalThis.localStorage.getItem("id_token"), idToken);
  assert.equal(globalThis.localStorage.getItem("access_token"), "at-legacy");
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-legacy");
});

test("handleCallback rejects mismatched OAuth state", async () => {
  setupEnvironment();
  globalThis.sessionStorage.setItem("oauth_state", "expected-state");
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true };
  };

  await assert.rejects(() => handleCallback(), /Invalid OAuth state/);

  assert.equal(fetchCalls, 0);
});

test("handleCallback deduplicates concurrent exchanges for the same code", async () => {
  setupEnvironment();
  const idToken = createIdToken();
  globalThis.sessionStorage.setItem("pkce_verifier", "pkce-verifier");

  let fetchCalls = 0;
  let release;
  const waitForRelease = new Promise((resolve) => {
    release = resolve;
  });

  globalThis.fetch = async () => {
    fetchCalls += 1;
    await waitForRelease;
    return {
      ok: true,
      json: async () => ({
        id_token: idToken,
        access_token: "at-1",
        refresh_token: "rt-1",
      }),
    };
  };

  const first = handleCallback();
  const second = handleCallback();

  release();
  const [firstSession, secondSession] = await Promise.all([first, second]);

  assert.equal(fetchCalls, 1);
  assert.ok(firstSession);
  assert.ok(secondSession);
  assert.equal(firstSession.idToken, idToken);
  assert.equal(secondSession.idToken, idToken);
  assert.equal(firstSession.accessToken, "at-1");
  assert.equal(secondSession.accessToken, "at-1");
});

test("getStoredSession returns an id-token-only session in legacy localStorage mode", () => {
  setupEnvironment({ firstParty: false });
  const idToken = createIdToken();
  globalThis.localStorage.setItem("id_token", idToken);
  globalThis.localStorage.setItem("access_token", "at-1");

  const session = getStoredSession();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.accessToken, "at-1");
  assert.equal(session.drk.length, 0);
});

test("refreshSession uses cookie refresh semantics by default", async () => {
  setupEnvironment();
  const idToken = createIdToken();
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = init.body;
    assert.equal(init.credentials, "include");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id_token: idToken,
        access_token: "at-2",
        refresh_token: "rt-2",
      }),
    };
  };

  const session = await refreshSession();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.accessToken, "at-2");
  assert.equal(session.drk.length, 0);
  assert.equal(session.refreshToken, undefined);
  assert.equal(requestBody.get("grant_type"), "refresh_token");
  assert.equal(requestBody.get("refresh_token"), null);
  assert.equal(globalThis.localStorage.getItem("id_token"), null);
  assert.equal(globalThis.localStorage.getItem("access_token"), null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), null);
});
