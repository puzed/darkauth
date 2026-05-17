import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { initiateLogin, setConfig } from "../dist/index.js";

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
  if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
  }
  if (!globalThis.crypto.randomUUID) {
    globalThis.crypto.randomUUID = webcrypto.randomUUID.bind(webcrypto);
  }
  if (!globalThis.btoa) {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (!globalThis.atob) {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
}

function createLocation() {
  let assignedUrl = "";
  const location = {
    assign(url) {
      assignedUrl = url;
    },
  };
  return {
    location,
    getAssignedUrl() {
      return assignedUrl;
    },
  };
}

test("initiateLogin adds ZK parameters when zk is true", async () => {
  setupEnvironment();
  const { location, getAssignedUrl } = createLocation();
  globalThis.location = location;
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    scope: "openid profile email",
    zk: true,
    discovery: false,
  });

  await initiateLogin();

  const assignedUrl = getAssignedUrl();
  const url = new URL(assignedUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(globalThis.sessionStorage.getItem("oauth_state"), url.searchParams.get("state"));
  assert.ok(url.searchParams.get("zk_pub"));
  assert.ok(globalThis.sessionStorage.getItem("zk_eph_priv_jwk"));
});

test("initiateLogin omits ZK parameters when zk is false", async () => {
  setupEnvironment();
  const { location, getAssignedUrl } = createLocation();
  globalThis.location = location;
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: false,
    discovery: false,
  });

  await initiateLogin();

  const assignedUrl = getAssignedUrl();
  const url = new URL(assignedUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(globalThis.sessionStorage.getItem("oauth_state"), url.searchParams.get("state"));
  assert.equal(url.searchParams.get("zk_pub"), null);
  assert.equal(globalThis.sessionStorage.getItem("zk_eph_priv_jwk"), null);
});

test("initiateLogin uses discovered authorization endpoint", async () => {
  setupEnvironment();
  const { location, getAssignedUrl } = createLocation();
  globalThis.location = location;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://issuer.example/.well-known/openid-configuration");
    return {
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://issuer.example/api/authorize",
        token_endpoint: "https://issuer.example/api/token",
      }),
    };
  };
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: false,
    discovery: true,
  });

  await initiateLogin();

  const url = new URL(getAssignedUrl());
  assert.equal(url.href.startsWith("https://issuer.example/api/authorize?"), true);
});

test("initiateLogin adds ZK parameters when zk is unset", async () => {
  setupEnvironment();
  const { location, getAssignedUrl } = createLocation();
  globalThis.location = location;
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: undefined,
    discovery: false,
  });

  await initiateLogin();

  const assignedUrl = getAssignedUrl();
  const url = new URL(assignedUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(globalThis.sessionStorage.getItem("oauth_state"), url.searchParams.get("state"));
  assert.ok(url.searchParams.get("zk_pub"));
  assert.ok(globalThis.sessionStorage.getItem("zk_eph_priv_jwk"));
});
