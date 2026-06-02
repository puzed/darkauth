import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { initiateLogin, setConfig, switchOrganization } from "../dist/index.js";

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

function token(claims = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "user-1",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })}.sig`;
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

test("initiateLogin includes organization_id when organizationId is supplied", async () => {
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

  await initiateLogin({ organizationId: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff" });

  const url = new URL(getAssignedUrl());
  assert.equal(url.searchParams.get("organization_id"), "8f9778b7-0f1d-46cb-ae32-74f03300f6ff");
});

test("switchOrganization updates the session organization and refreshes by default", async () => {
  setupEnvironment();
  const { location, getAssignedUrl } = createLocation();
  globalThis.location = location;
  const idToken = token({ org_id: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff" });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/api/user/session/organization") {
      assert.equal(init.method, "POST");
      assert.equal(init.credentials, "include");
      const body = JSON.parse(init.body);
      assert.equal(body.organization_id, "8f9778b7-0f1d-46cb-ae32-74f03300f6ff");
      assert.equal(body.client_id, "client-id");
      return { ok: true, json: async () => ({ organizationId: body.organization_id }) };
    }
    if (parsed.pathname === "/token") {
      assert.equal(init.method, "POST");
      assert.equal(init.credentials, "include");
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("client_id"), "client-id");
      return { ok: true, json: async () => ({ id_token: idToken }) };
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: false,
    discovery: false,
  });

  const session = await switchOrganization("8f9778b7-0f1d-46cb-ae32-74f03300f6ff");

  assert.equal(session.idToken, idToken);
  assert.equal(getAssignedUrl(), "");
  assert.equal(calls.length, 2);
});

test("switchOrganization can start authorize flow", async () => {
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

  await switchOrganization("8f9778b7-0f1d-46cb-ae32-74f03300f6ff", { mode: "authorize" });

  const url = new URL(getAssignedUrl());
  assert.equal(url.pathname, "/authorize");
  assert.equal(url.searchParams.get("organization_id"), "8f9778b7-0f1d-46cb-ae32-74f03300f6ff");
  assert.equal(url.searchParams.get("client_id"), "client-id");
});

test("switchOrganization can generate hosted switch URL", async () => {
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

  await switchOrganization("8f9778b7-0f1d-46cb-ae32-74f03300f6ff", {
    mode: "hosted",
    returnTo: "https://app.example/workspace",
  });

  const url = new URL(getAssignedUrl());
  assert.equal(url.pathname, "/switch-org");
  assert.equal(url.searchParams.get("organization_id"), "8f9778b7-0f1d-46cb-ae32-74f03300f6ff");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("return_to"), "https://app.example/workspace");
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
