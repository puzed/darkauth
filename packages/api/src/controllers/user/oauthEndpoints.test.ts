import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { authCodes, clients, organizationMembers, organizations, users } from "../../db/schema.ts";
import { InvalidGrantError, UnauthorizedClientError } from "../../errors.ts";
import { generateEdDSAKeyPair, signJWT, storeKeyPair } from "../../services/jwks.ts";
import {
  createSession,
  getActiveRefreshTokenSession,
  USER_REFRESH_COOKIE_NAME,
} from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { sha256Base64Url } from "../../utils/crypto.ts";
import { postIntrospect } from "./introspect.ts";
import { postRevoke } from "./revoke.ts";
import { postToken } from "./token.ts";
import { handleUserinfo } from "./userinfo.ts";
import { getWellKnownOpenidConfiguration } from "./wellKnownOpenid.ts";

function createLogger() {
  return {
    error() {},
    warn() {},
    info() {},
    debug() {},
    trace() {},
    fatal() {},
  };
}

async function createContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-oauth-endpoints-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    config: {
      issuer: "http://localhost:9080",
      publicOrigin: "http://localhost:9080",
      postgresUri: "",
      userPort: 9080,
      adminPort: 9081,
      proxyUi: false,
      kekPassphrase: "test",
      isDevelopment: true,
      rpId: "localhost",
    },
    services: {
      kek: {
        encrypt: async (data: Buffer) => Buffer.from(data),
        decrypt: async (data: Buffer) => Buffer.from(data),
        isAvailable: () => true,
      },
    },
    logger: createLogger(),
    cleanupFunctions: [],
    destroy: async () => {},
  } as Context;
  const { kid, publicJwk, privateJwk } = await generateEdDSAKeyPair();
  await storeKeyPair(context, kid, publicJwk, privateJwk);
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method?: string;
  url?: string;
  body?: string;
  authorization?: string;
  cookie?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method || "GET";
  request.url = options.url || "/userinfo";
  request.headers = {
    host: "localhost",
    "user-agent": "node-test",
    ...(options.authorization ? { authorization: options.authorization } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  let body = "";
  const headers = new Map<string, string | string[] | number>();
  return {
    statusCode: 0,
    setHeader(name: string, value: string | string[] | number) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get json() {
      return body ? JSON.parse(body) : undefined;
    },
  } as ServerResponse & { body: string; json: unknown };
}

function basic(clientId: string, secret: string) {
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

async function createUser(context: Context) {
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "Test User",
    emailVerifiedAt: new Date(),
  });
}

async function createUserOrganization(context: Context) {
  const [organization] = await context.db
    .insert(organizations)
    .values({
      slug: "test-org",
      name: "Test Org",
      createdByUserSub: "user-sub",
    })
    .returning();
  assert.ok(organization);
  await context.db.insert(organizationMembers).values({
    organizationId: organization.id,
    userSub: "user-sub",
    status: "active",
  });
  return organization;
}

async function createPublicClient(context: Context) {
  await context.db.insert(clients).values({
    clientId: "public-client",
    name: "Public",
    type: "public",
    tokenEndpointAuthMethod: "none",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
  });
}

async function createPublicRefreshClient(context: Context, clientId = "public-refresh-client") {
  await context.db.insert(clients).values({
    clientId,
    name: "Public Refresh",
    type: "public",
    tokenEndpointAuthMethod: "none",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
    grantTypes: ["authorization_code", "refresh_token"],
  });
}

async function createConfidentialClient(context: Context, clientId = "confidential-client") {
  await context.db.insert(clients).values({
    clientId,
    name: "Confidential",
    type: "confidential",
    tokenEndpointAuthMethod: "client_secret_basic",
    clientSecretEnc: Buffer.from("secret"),
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
    grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
  });
}

async function createAuthorizationCode(context: Context, clientId: string, code: string) {
  const codeVerifier = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq";
  await context.db.insert(authCodes).values({
    code,
    clientId,
    userSub: "user-sub",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    codeChallenge: sha256Base64Url(codeVerifier),
    codeChallengeMethod: "S256",
    expiresAt: new Date(Date.now() + 60_000),
  });
  return codeVerifier;
}

test("userinfo returns claims allowed by access token scopes", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    const token = await signJWT(
      context,
      {
        iss: context.config.issuer,
        sub: "user-sub",
        aud: "public-client",
        azp: "public-client",
        scope: "openid profile email",
        token_use: "access",
        grant_type: "authorization_code",
        org_id: "org-id",
        org_slug: "default",
        permissions: ["darkauth.users:read"],
      },
      "5m"
    );
    const request = createRequest({ authorization: `Bearer ${token}` });
    const response = createResponse();

    await handleUserinfo(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      sub: "user-sub",
      name: "Test User",
      email: "user@example.com",
      email_verified: true,
      org_id: "org-id",
      org_slug: "default",
      permissions: ["darkauth.users:read"],
    });
  } finally {
    await cleanup();
  }
});

test("openid discovery advertises oauth metadata endpoints", async () => {
  const { context, cleanup } = await createContext();
  try {
    const request = createRequest({ url: "/.well-known/openid-configuration" });
    const response = createResponse();

    await getWellKnownOpenidConfiguration(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.userinfo_endpoint, "http://localhost:9080/api/userinfo");
    assert.equal(json.introspection_endpoint, "http://localhost:9080/api/introspect");
    assert.equal(json.revocation_endpoint, "http://localhost:9080/api/revoke");
  } finally {
    await cleanup();
  }
});

test("token rejects confidential clients configured with none auth", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await context.db.insert(clients).values({
      clientId: "confidential-none-client",
      name: "Confidential None",
      type: "confidential",
      tokenEndpointAuthMethod: "none",
      redirectUris: ["https://app.example.com/callback"],
      postLogoutRedirectUris: [],
    });
    const codeVerifier = await createAuthorizationCode(
      context,
      "confidential-none-client",
      "confidential-none-code"
    );
    const request = createRequest({
      method: "POST",
      url: "/token",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "confidential-none-code",
        redirect_uri: "https://app.example.com/callback",
        client_id: "confidential-none-client",
        code_verifier: codeVerifier,
      }).toString(),
    });
    const response = createResponse();

    await assert.rejects(
      () => postToken(context, request, response),
      (error: unknown) =>
        error instanceof UnauthorizedClientError && error.message === "Invalid client auth method"
    );
  } finally {
    await cleanup();
  }
});

test("token redeems public authorization code clients with none auth", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createUserOrganization(context);
    await createPublicClient(context);
    const codeVerifier = await createAuthorizationCode(context, "public-client", "public-code");
    const request = createRequest({
      method: "POST",
      url: "/token",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "public-code",
        redirect_uri: "https://app.example.com/callback",
        client_id: "public-client",
        code_verifier: codeVerifier,
      }).toString(),
    });
    const response = createResponse();

    await postToken(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.token_type, "Bearer");
    assert.equal(typeof json.access_token, "string");
    assert.equal(typeof json.id_token, "string");
  } finally {
    await cleanup();
  }
});

test("token rejects explicit unbound refresh tokens for public clients", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createUserOrganization(context);
    await createPublicRefreshClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/token",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: issued.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    const response = createResponse();

    await assert.rejects(
      () => postToken(context, request, response),
      (error: unknown) =>
        error instanceof InvalidGrantError &&
        error.message === "Refresh token was not issued to this client"
    );
  } finally {
    await cleanup();
  }
});

test("token redeems bound public refresh tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createUserOrganization(context);
    await createPublicRefreshClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      clientId: "public-refresh-client",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/token",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: issued.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    const response = createResponse();

    await postToken(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.token_type, "Bearer");
    assert.equal(typeof json.refresh_token, "string");
  } finally {
    await cleanup();
  }
});

test("token allows unbound first-party cookie refresh", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createUserOrganization(context);
    await createPublicRefreshClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/token",
      cookie: `${USER_REFRESH_COOKIE_NAME}=${encodeURIComponent(issued.refreshToken)}`,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "public-refresh-client",
      }).toString(),
    });
    const response = createResponse();

    await postToken(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.token_type, "Bearer");
    assert.equal(json.refresh_token, undefined);
  } finally {
    await cleanup();
  }
});

test("introspect returns active metadata for same-client access tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createConfidentialClient(context);
    const token = await signJWT(
      context,
      {
        iss: context.config.issuer,
        sub: "user-sub",
        aud: "confidential-client",
        azp: "confidential-client",
        scope: "openid profile",
        token_use: "access",
        grant_type: "authorization_code",
      },
      "5m"
    );
    const request = createRequest({
      method: "POST",
      url: "/introspect",
      authorization: basic("confidential-client", "secret"),
      body: new URLSearchParams({ token }).toString(),
    });
    const response = createResponse();

    await postIntrospect(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.active, true);
    assert.equal(json.client_id, "confidential-client");
    assert.equal(json.sub, "user-sub");
    assert.equal(json.scope, "openid profile");
  } finally {
    await cleanup();
  }
});

test("introspect returns inactive for wrong-client access tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createConfidentialClient(context);
    const token = await signJWT(
      context,
      {
        iss: context.config.issuer,
        sub: "user-sub",
        aud: "other-client",
        azp: "other-client",
        scope: "openid profile",
        token_use: "access",
        grant_type: "authorization_code",
      },
      "5m"
    );
    const request = createRequest({
      method: "POST",
      url: "/introspect",
      authorization: basic("confidential-client", "secret"),
      body: new URLSearchParams({ token }).toString(),
    });
    const response = createResponse();

    await postIntrospect(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { active: false });
  } finally {
    await cleanup();
  }
});

test("introspect returns active metadata for bound refresh tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createConfidentialClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      clientId: "confidential-client",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/introspect",
      authorization: basic("confidential-client", "secret"),
      body: new URLSearchParams({
        token: issued.refreshToken,
        token_type_hint: "refresh_token",
      }).toString(),
    });
    const response = createResponse();

    await postIntrospect(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.active, true);
    assert.equal(json.token_type, "refresh_token");
    assert.equal(json.client_id, "confidential-client");
    assert.equal(json.sub, "user-sub");
    assert.equal(json.scope, "openid profile");
  } finally {
    await cleanup();
  }
});

test("introspect returns inactive for wrong-client refresh tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createConfidentialClient(context);
    await createConfidentialClient(context, "other-confidential-client");
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      clientId: "other-confidential-client",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/introspect",
      authorization: basic("confidential-client", "secret"),
      body: new URLSearchParams({
        token: issued.refreshToken,
        token_type_hint: "refresh_token",
      }).toString(),
    });
    const response = createResponse();

    await postIntrospect(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { active: false });
  } finally {
    await cleanup();
  }
});

test("introspect returns inactive for unbound refresh tokens", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createConfidentialClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/introspect",
      authorization: basic("confidential-client", "secret"),
      body: new URLSearchParams({
        token: issued.refreshToken,
        token_type_hint: "refresh_token",
      }).toString(),
    });
    const response = createResponse();

    await postIntrospect(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { active: false });
  } finally {
    await cleanup();
  }
});

test("revoke deletes refresh token sessions for the bound public client", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createPublicClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      clientId: "public-client",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/revoke",
      body: new URLSearchParams({
        token: issued.refreshToken,
        client_id: "public-client",
      }).toString(),
    });
    const response = createResponse();

    await postRevoke(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {});
    assert.equal(await getActiveRefreshTokenSession(context, issued.refreshToken), undefined);
    const rows = await context.db.query.sessions.findMany({
      where: (table, { eq }) => eq(table.refreshToken, sha256Base64Url(issued.refreshToken)),
    });
    assert.equal(rows.length, 0);
  } finally {
    await cleanup();
  }
});

test("revoke does not delete unbound refresh token sessions", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createPublicClient(context);
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/revoke",
      body: new URLSearchParams({
        token: issued.refreshToken,
        client_id: "public-client",
      }).toString(),
    });
    const response = createResponse();

    await postRevoke(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {});
    assert.ok(await getActiveRefreshTokenSession(context, issued.refreshToken));
  } finally {
    await cleanup();
  }
});

test("revoke does not delete refresh token sessions for the wrong public client", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createPublicClient(context);
    await context.db.insert(clients).values({
      clientId: "other-public-client",
      name: "Other Public",
      type: "public",
      tokenEndpointAuthMethod: "none",
      redirectUris: ["https://other.example.com/callback"],
      postLogoutRedirectUris: [],
    });
    const issued = await createSession(context, "user", {
      sub: "user-sub",
      clientId: "public-client",
      scope: "openid profile",
    });
    const request = createRequest({
      method: "POST",
      url: "/revoke",
      body: new URLSearchParams({
        token: issued.refreshToken,
        client_id: "other-public-client",
      }).toString(),
    });
    const response = createResponse();

    await postRevoke(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {});
    assert.ok(await getActiveRefreshTokenSession(context, issued.refreshToken));
  } finally {
    await cleanup();
  }
});
