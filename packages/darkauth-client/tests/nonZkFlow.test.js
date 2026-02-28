import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCallback, getStoredSession, refreshSession, setConfig } from "../dist/index.js";

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

function setupEnvironment() {
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  globalThis.history = { replaceState() {} };
  globalThis.location = {
    search: "?code=abc",
    hash: "",
    origin: "https://app.example",
    pathname: "/callback",
  };
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: false,
  });
}

test("handleCallback succeeds without DRK JWE when callback is non-zk", async () => {
  setupEnvironment();
  const idToken = createIdToken();
  globalThis.sessionStorage.setItem("pkce_verifier", "pkce-verifier");
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      id_token: idToken,
      refresh_token: "rt-1",
    }),
  });

  const session = await handleCallback();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.drk.length, 0);
  assert.equal(globalThis.localStorage.getItem("id_token"), idToken);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-1");
});

test("getStoredSession returns an id-token-only session when no DRK is stored", () => {
  setupEnvironment();
  const idToken = createIdToken();
  globalThis.localStorage.setItem("id_token", idToken);

  const session = getStoredSession();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.drk.length, 0);
});

test("refreshSession returns an id-token-only session when no DRK is stored", async () => {
  setupEnvironment();
  const idToken = createIdToken();
  globalThis.localStorage.setItem("refresh_token", "rt-1");
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id_token: idToken,
      refresh_token: "rt-2",
    }),
  });

  const session = await refreshSession();

  assert.ok(session);
  assert.equal(session.idToken, idToken);
  assert.equal(session.drk.length, 0);
  assert.equal(session.refreshToken, "rt-2");
});
