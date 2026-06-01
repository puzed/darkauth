import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSessionInfo,
  listOrganizations,
  setConfig,
  UnauthenticatedSessionError,
} from "../dist/index.js";

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
    zk: false,
    discovery: false,
  });
}

test("listOrganizations fetches user organizations with roles", async () => {
  setupEnvironment();
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://issuer.example/api/user/organizations");
    assert.equal(init.credentials, "include");
    return {
      ok: true,
      json: async () => ({
        organizations: [
          {
            organizationId: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff",
            slug: "acme",
            name: "Acme",
            status: "active",
            roles: [{ id: "6fcf00cb-a111-4ee2-ae62-676571e73a4d", key: "admin", name: "Admin" }],
          },
        ],
      }),
    };
  };

  const organizations = await listOrganizations();

  assert.deepEqual(organizations, [
    {
      organizationId: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff",
      slug: "acme",
      name: "Acme",
      status: "active",
      roles: [{ id: "6fcf00cb-a111-4ee2-ae62-676571e73a4d", key: "admin", name: "Admin" }],
    },
  ]);
});

test("listOrganizations throws typed unauthenticated error on 401", async () => {
  setupEnvironment();
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: "User session required" }),
  });

  await assert.rejects(() => listOrganizations(), UnauthenticatedSessionError);
});

test("getSessionInfo returns unauthenticated session on 401", async () => {
  setupEnvironment();
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://issuer.example/api/user/session");
    assert.equal(init.credentials, "include");
    return {
      ok: false,
      status: 401,
      json: async () => ({ message: "User session required" }),
    };
  };

  const session = await getSessionInfo();

  assert.deepEqual(session, { authenticated: false });
});

test("getSessionInfo returns current organization context", async () => {
  setupEnvironment();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      authenticated: true,
      sub: "user-1",
      email: "user@example.com",
      name: "User",
      organizationId: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff",
      organizationSlug: "acme",
    }),
  });

  const session = await getSessionInfo();

  assert.deepEqual(session, {
    authenticated: true,
    sub: "user-1",
    email: "user@example.com",
    name: "User",
    organizationId: "8f9778b7-0f1d-46cb-ae32-74f03300f6ff",
    organizationSlug: "acme",
  });
});
