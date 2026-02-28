import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshSession, setConfig } from "../dist/index.js";

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

function setupEnvironment() {
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: true,
  });
}

test("refreshSession does not clear refresh token on server errors", async () => {
  setupEnvironment();
  globalThis.localStorage.setItem("refresh_token", "rt-1");
  globalThis.fetch = async () => ({ ok: false, status: 500 });

  const result = await refreshSession();

  assert.equal(result, null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), "rt-1");
});

test("refreshSession clears refresh token on 401", async () => {
  setupEnvironment();
  globalThis.localStorage.setItem("refresh_token", "rt-2");
  globalThis.fetch = async () => ({ ok: false, status: 401 });

  const result = await refreshSession();

  assert.equal(result, null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), null);
});

test("refreshSession keeps a newer refresh token on 401", async () => {
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
