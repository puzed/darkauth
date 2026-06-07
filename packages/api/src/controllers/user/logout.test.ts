import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../../db/pglite.ts";
import { clients, sessions, users } from "../../db/schema.ts";
import { InvalidRequestError } from "../../errors.ts";
import { generateEdDSAKeyPair, signJWT, storeKeyPair } from "../../services/jwks.ts";
import { USER_AUTH_COOKIE_NAME } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { getLogout, postLogout } from "./logout.ts";
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-logout-test-"));
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
  cookie?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method || "GET";
  request.url = options.url || "/logout";
  request.headers = {
    host: "localhost",
    "user-agent": "node-test",
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
    write() {
      return true;
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

async function createUser(context: Context) {
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "Test User",
    emailVerifiedAt: new Date(),
  });
}

async function createLogoutClient(context: Context) {
  await context.db.insert(clients).values({
    clientId: "logout-client",
    name: "Logout",
    type: "public",
    tokenEndpointAuthMethod: "none",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: ["https://app.example.com/logout"],
  });
}

async function createUserSession(context: Context, sessionId: string) {
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub: "user-sub", email: "user@example.com", clientId: "logout-client" },
  });
}

async function mintIdTokenHint(context: Context, expiresIn = "5m") {
  return await signJWT(
    context,
    {
      iss: context.config.issuer,
      sub: "user-sub",
      aud: "logout-client",
      azp: "logout-client",
    },
    expiresIn
  );
}

function cookie(sessionId: string) {
  return `${USER_AUTH_COOKIE_NAME}=${sessionId}`;
}

test("openid discovery advertises end_session_endpoint", async () => {
  const { context, cleanup } = await createContext();
  try {
    const request = createRequest({ url: "/.well-known/openid-configuration" });
    const response = createResponse();

    await getWellKnownOpenidConfiguration(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.end_session_endpoint, "http://localhost:9080/api/logout");
  } finally {
    await cleanup();
  }
});

test("GET logout redirects to allowlisted post_logout_redirect_uri with state and ends session", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    await createUserSession(context, "logout-session-id");
    const idTokenHint = await mintIdTokenHint(context);
    const url = `/logout?${new URLSearchParams({
      id_token_hint: idTokenHint,
      post_logout_redirect_uri: "https://app.example.com/logout",
      state: "abc123",
    }).toString()}`;
    const request = createRequest({ url, cookie: cookie("logout-session-id") });
    const response = createResponse();

    await getLogout(context, request, response);

    assert.equal(response.statusCode, 302);
    assert.equal(response.getHeader("location"), "https://app.example.com/logout?state=abc123");
    const remaining = await context.db.query.sessions.findFirst({
      where: eq(sessions.id, "logout-session-id"),
    });
    assert.equal(remaining, undefined);
  } finally {
    await cleanup();
  }
});

test("GET logout rejects post_logout_redirect_uri not in allowlist", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    const idTokenHint = await mintIdTokenHint(context);
    const url = `/logout?${new URLSearchParams({
      id_token_hint: idTokenHint,
      post_logout_redirect_uri: "https://evil.example.com/logout",
    }).toString()}`;
    const request = createRequest({ url });
    const response = createResponse();

    await assert.rejects(
      () => getLogout(context, request, response),
      (error: unknown) =>
        error instanceof InvalidRequestError && error.message === "Invalid post_logout_redirect_uri"
    );
  } finally {
    await cleanup();
  }
});

test("GET logout rejects client_id mismatched with id_token_hint aud", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    const idTokenHint = await mintIdTokenHint(context);
    const url = `/logout?${new URLSearchParams({
      id_token_hint: idTokenHint,
      client_id: "other-client",
    }).toString()}`;
    const request = createRequest({ url });
    const response = createResponse();

    await assert.rejects(
      () => getLogout(context, request, response),
      (error: unknown) =>
        error instanceof InvalidRequestError &&
        error.message === "client_id does not match id_token_hint"
    );
  } finally {
    await cleanup();
  }
});

test("GET logout accepts an expired id_token_hint", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    await createUserSession(context, "expired-hint-session-id");
    const idTokenHint = await mintIdTokenHint(context, Math.floor(Date.now() / 1000) - 60);
    const url = `/logout?${new URLSearchParams({
      id_token_hint: idTokenHint,
      post_logout_redirect_uri: "https://app.example.com/logout",
    }).toString()}`;
    const request = createRequest({ url, cookie: cookie("expired-hint-session-id") });
    const response = createResponse();

    await getLogout(context, request, response);

    assert.equal(response.statusCode, 302);
    assert.equal(response.getHeader("location"), "https://app.example.com/logout");
    const remaining = await context.db.query.sessions.findFirst({
      where: eq(sessions.id, "expired-hint-session-id"),
    });
    assert.equal(remaining, undefined);
  } finally {
    await cleanup();
  }
});

test("GET logout asks for confirmation when no valid id_token_hint but session is active", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    await createUserSession(context, "confirm-session-id");
    const request = createRequest({
      url: "/logout",
      cookie: cookie("confirm-session-id"),
    });
    const response = createResponse();

    await getLogout(context, request, response);

    assert.equal(response.statusCode, 302);
    const location = response.getHeader("location") as string;
    assert.ok(location.startsWith("/logout?confirm=1"));
    const remaining = await context.db.query.sessions.findFirst({
      where: eq(sessions.id, "confirm-session-id"),
    });
    assert.ok(remaining);
  } finally {
    await cleanup();
  }
});

test("POST logout with no params returns logged_out and ends session", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createLogoutClient(context);
    await createUserSession(context, "post-logout-session-id");
    const request = createRequest({
      method: "POST",
      url: "/logout",
      cookie: cookie("post-logout-session-id"),
    });
    const response = createResponse();

    await postLogout(context, request, response);

    const json = response.json as Record<string, unknown>;
    assert.equal(response.statusCode, 200);
    assert.equal(json.logged_out, true);
    const remaining = await context.db.query.sessions.findFirst({
      where: eq(sessions.id, "post-logout-session-id"),
    });
    assert.equal(remaining, undefined);
  } finally {
    await cleanup();
  }
});
