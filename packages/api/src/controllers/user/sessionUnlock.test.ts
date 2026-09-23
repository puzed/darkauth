import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../../db/pglite.ts";
import {
  organizationMembers,
  organizations,
  pendingAuth,
  scimUsers,
  sessions,
  users,
} from "../../db/schema.ts";
import { createClient } from "../../models/clients.ts";
import { getUserClientConsent, recordUserClientConsent } from "../../models/consents.ts";
import { refreshSessionWithToken, updateSession } from "../../services/sessions.ts";
import { setSetting } from "../../services/settings.ts";
import type { Context, SessionData } from "../../types.ts";
import { sha256Base64Url } from "../../utils/crypto.ts";
import { getAuthorize } from "./authorize.ts";
import { postAuthorizeFinalize } from "./authorizeFinalize.ts";
import { postAuthorizeRestart } from "./authorizeRestart.ts";
import { deleteUserConsent, getUserConsents } from "./consents.ts";
import { deleteSessionUnlockKeyController, postSessionUnlockKey } from "./sessionUnlockKey.ts";
import { getUserSessions, postUserSessionsRevokeOthers } from "./userSessions.ts";

function createLogger() {
  return { error() {}, warn() {}, info() {}, debug() {}, trace() {}, fatal() {} };
}

async function createContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-session-unlock-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    logger: createLogger(),
    services: {},
    config: {
      postgresUri: "",
      userPort: 0,
      adminPort: 0,
      proxyUi: false,
      kekPassphrase: "",
      isDevelopment: true,
      publicOrigin: "https://auth.example.com",
      issuer: "https://auth.example.com",
      rpId: "auth.example.com",
    },
    cleanupFunctions: [],
    destroy: async () => {},
  } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method: string;
  url: string;
  sessionId?: string;
  body?: URLSearchParams;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body.toString()] : []) as IncomingMessage;
  request.method = options.method;
  request.url = options.url;
  request.headers = {
    host: "auth.example.com",
    cookie: options.sessionId ? `__Host-DarkAuth-User=${options.sessionId}` : "",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "node-test",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

type TestResponse = ServerResponse & {
  body: string;
  headers: Record<string, string | string[]>;
  json: unknown;
};

function createResponse(): TestResponse {
  let body = "";
  const headers: Record<string, string | string[]> = {};
  return {
    statusCode: 0,
    setHeader(name: string, value: string | string[]) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    write(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
    get json() {
      return body ? JSON.parse(body) : undefined;
    },
  } as TestResponse;
}

async function insertSession(
  context: Context,
  id: string,
  data: SessionData,
  refreshToken = `${id}-refresh`
) {
  await context.db.insert(sessions).values({
    id,
    cohort: "user",
    userSub: data.sub ?? "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    refreshToken: sha256Base64Url(refreshToken),
    refreshTokenExpiresAt: new Date(Date.now() + 3_600_000),
    data,
  });
}

async function createUser(context: Context) {
  await context.db.insert(users).values({ sub: "user-sub", email: "user@example.com" });
}

async function sessionData(context: Context, id: string) {
  const row = await context.db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  return row?.data as SessionData | undefined;
}

async function call(
  handler: (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ...params: string[]
  ) => Promise<void>,
  context: Context,
  options: Parameters<typeof createRequest>[0],
  ...params: string[]
) {
  const response = createResponse();
  await handler(context, createRequest(options), response, ...params);
  return response;
}

const signIn = (id: string): SessionData => ({
  sub: "user-sub",
  otpVerified: true,
  keyState: "unlocked",
  signInId: id,
  signInCreatedAt: new Date().toISOString(),
  userAgent: "node-test",
});

test("session unlock key is stable, survives updates and rotation, and can be deleted", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await insertSession(context, "session-a", signIn("sign-in-a"), "refresh-a");
    const url = "/crypto/session-unlock-key";

    const first = await call(postSessionUnlockKey, context, {
      method: "POST",
      url,
      sessionId: "session-a",
    });
    assert.equal(first.statusCode, 200);
    const key = (first.json as { key: string }).key;
    assert.equal(Buffer.from(key, "base64url").length, 32);

    const second = await call(postSessionUnlockKey, context, {
      method: "POST",
      url,
      sessionId: "session-a",
    });
    assert.equal((second.json as { key: string }).key, key);

    await updateSession(context, "session-a", { ...signIn("sign-in-a"), keyState: "locked" });
    assert.equal((await sessionData(context, "session-a"))?.sessionUnlockKey, key);

    const rotated = await refreshSessionWithToken(context, "refresh-a");
    assert.ok(rotated);
    const rotatedData = await sessionData(context, rotated.sessionId);
    assert.equal(rotatedData?.sessionUnlockKey, key);
    assert.equal(rotatedData?.signInId, "sign-in-a");
    assert.ok(rotatedData?.lastActiveAt);

    const deleted = await call(deleteSessionUnlockKeyController, context, {
      method: "DELETE",
      url,
      sessionId: rotated.sessionId,
    });
    assert.equal(deleted.statusCode, 204);
    assert.equal((await sessionData(context, rotated.sessionId))?.sessionUnlockKey, undefined);

    const next = await call(postSessionUnlockKey, context, {
      method: "POST",
      url,
      sessionId: rotated.sessionId,
    });
    assert.notEqual((next.json as { key: string }).key, key);
  } finally {
    await cleanup();
  }
});

test("session unlock key is refused for partial sessions, legacy sessions and by policy", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    const url = "/crypto/session-unlock-key";
    await insertSession(context, "legacy", { sub: "user-sub", otpVerified: true });
    await assert.rejects(
      call(postSessionUnlockKey, context, { method: "POST", url, sessionId: "legacy" }),
      { code: "FORBIDDEN" }
    );

    await insertSession(context, "full", signIn("sign-in-full"));
    await context.db
      .insert(scimUsers)
      .values({ userSub: "user-sub", userName: "user@example.com", active: true });
    await setSetting(context, "users.scim.allow_session_unlock", false);
    await assert.rejects(
      call(postSessionUnlockKey, context, { method: "POST", url, sessionId: "full" }),
      { code: "FORBIDDEN" }
    );

    await context.db.insert(organizations).values({
      id: "33333333-3333-4333-8333-333333333333",
      slug: "otp-org",
      name: "OTP",
      forceOtp: true,
    });
    await context.db.insert(organizationMembers).values({
      organizationId: "33333333-3333-4333-8333-333333333333",
      userSub: "user-sub",
      status: "active",
    });
    await insertSession(context, "partial", { ...signIn("sign-in-partial"), otpVerified: false });
    await assert.rejects(
      call(postSessionUnlockKey, context, { method: "POST", url, sessionId: "partial" }),
      { code: "UNAUTHORIZED" }
    );
  } finally {
    await cleanup();
  }
});

test("sign-ins are listed per sign-in and revoke-others removes their app sessions", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await insertSession(context, "current", { ...signIn("sign-in-a"), sessionUnlockKey: "k1" });
    await insertSession(context, "other", { ...signIn("sign-in-b"), sessionUnlockKey: "k2" });
    await insertSession(context, "other-app", {
      sub: "user-sub",
      clientId: "atlas",
      scope: "openid",
      parentSignInId: "sign-in-b",
    });
    await insertSession(context, "current-app", {
      sub: "user-sub",
      clientId: "atlas",
      scope: "openid",
      parentSignInId: "sign-in-a",
    });

    const list = await call(getUserSessions, context, {
      method: "GET",
      url: "/sessions",
      sessionId: "current",
    });
    assert.equal(list.statusCode, 200);
    assert.ok(!list.body.includes("k1"));
    assert.ok(!list.body.includes("current-refresh"));
    const entries = (list.json as { sessions: Array<{ id: string; current: boolean }> }).sessions;
    assert.deepEqual(entries.map((entry) => [entry.id, entry.current]).sort(), [
      ["sign-in-a", true],
      ["sign-in-b", false],
    ]);

    const revoke = await call(postUserSessionsRevokeOthers, context, {
      method: "POST",
      url: "/sessions/revoke-others",
      sessionId: "current",
    });
    assert.equal(revoke.statusCode, 204);
    const remaining = (await context.db.query.sessions.findMany()).map((row) => row.id).sort();
    assert.deepEqual(remaining, ["current", "current-app"]);
  } finally {
    await cleanup();
  }
});

async function authorize(context: Context, query: Record<string, string>) {
  const params = new URLSearchParams({
    client_id: "atlas",
    redirect_uri: "https://atlas.example/callback",
    response_type: "code",
    scope: "openid profile",
    state: "s",
    ...query,
  });
  const response = await call(getAuthorize, context, {
    method: "GET",
    url: `/authorize?${params.toString()}`,
    sessionId: "current",
  });
  return new URL(response.headers.Location as string, "https://auth.example.com");
}

test("remembered consent auto-finalizes covered requests and can be revoked", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await context.db.insert(organizations).values([
      { id: "11111111-1111-4111-8111-111111111111", slug: "one", name: "One" },
      { id: "22222222-2222-4222-8222-222222222222", slug: "two", name: "Two" },
    ]);
    await context.db.insert(organizationMembers).values({
      organizationId: "11111111-1111-4111-8111-111111111111",
      userSub: "user-sub",
      status: "active",
    });
    await insertSession(context, "current", signIn("sign-in-a"));
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid", "profile"],
    });

    const none = await authorize(context, { prompt: "none" });
    assert.equal(none.origin, "https://atlas.example");
    assert.equal(none.searchParams.get("error"), "consent_required");

    const first = await authorize(context, {});
    assert.equal(first.searchParams.get("auto_finalize"), null);
    const finalize = await call(postAuthorizeFinalize, context, {
      method: "POST",
      url: "/authorize/finalize",
      sessionId: "current",
      body: new URLSearchParams({
        request_id: first.searchParams.get("request_id") as string,
        approve: "true",
      }),
    });
    assert.equal(finalize.statusCode, 200);
    const authCode = await context.db.query.authCodes.findFirst();
    assert.equal(authCode?.signInId, "sign-in-a");

    const second = await authorize(context, { scope: "openid" });
    assert.equal(second.searchParams.get("auto_finalize"), "1");
    assert.equal(
      second.searchParams.get("organization_id"),
      "11111111-1111-4111-8111-111111111111"
    );
    assert.equal(
      (await authorize(context, { prompt: "consent" })).searchParams.get("auto_finalize"),
      null
    );
    const forcedLogin = await authorize(context, { prompt: "login" });
    assert.equal(forcedLogin.searchParams.get("auto_finalize"), null);
    assert.equal(forcedLogin.searchParams.get("prompt"), "login");
    await assert.rejects(
      call(postAuthorizeFinalize, context, {
        method: "POST",
        url: "/authorize/finalize",
        sessionId: "current",
        body: new URLSearchParams({
          request_id: forcedLogin.searchParams.get("request_id") as string,
          approve: "true",
        }),
      }),
      /requires signing in again/
    );
    await updateSession(context, "current", {
      ...signIn("sign-in-a"),
      signInCreatedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const afterFreshLogin = await call(postAuthorizeFinalize, context, {
      method: "POST",
      url: "/authorize/finalize",
      sessionId: "current",
      body: new URLSearchParams({
        request_id: (await authorize(context, { prompt: "login" })).searchParams.get(
          "request_id"
        ) as string,
        approve: "true",
      }),
    });
    assert.equal(afterFreshLogin.statusCode, 200);
    await updateSession(context, "current", signIn("sign-in-a"));

    await context.db.insert(organizationMembers).values({
      organizationId: "22222222-2222-4222-8222-222222222222",
      userSub: "user-sub",
      status: "active",
    });
    assert.equal((await authorize(context, {})).searchParams.get("auto_finalize"), null);
    assert.equal(
      (
        await authorize(context, {
          organization_id: "11111111-1111-4111-8111-111111111111",
        })
      ).searchParams.get("auto_finalize"),
      null
    );
    assert.equal(
      (
        await authorize(context, {
          organization_id: "22222222-2222-4222-8222-222222222222",
        })
      ).searchParams.get("auto_finalize"),
      null
    );
    const silentWithChoice = await authorize(context, { prompt: "none" });
    assert.equal(silentWithChoice.searchParams.get("error"), "consent_required");
    await context.db
      .delete(organizationMembers)
      .where(eq(organizationMembers.organizationId, "11111111-1111-4111-8111-111111111111"));
    assert.equal((await authorize(context, {})).searchParams.get("auto_finalize"), null);
    await context.db.insert(organizationMembers).values({
      organizationId: "11111111-1111-4111-8111-111111111111",
      userSub: "user-sub",
      status: "active",
    });
    await context.db
      .delete(organizationMembers)
      .where(eq(organizationMembers.organizationId, "22222222-2222-4222-8222-222222222222"));

    const consents = await call(getUserConsents, context, {
      method: "GET",
      url: "/consents",
      sessionId: "current",
    });
    assert.deepEqual(consents.json, {
      consents: [
        {
          client_id: "atlas",
          client_name: "Atlas",
          scopes: ["openid", "profile"],
          organization_id: "11111111-1111-4111-8111-111111111111",
          updated_at: (consents.json as { consents: Array<{ updated_at: string }> }).consents[0]
            ?.updated_at,
        },
      ],
    });

    await insertSession(context, "app", {
      sub: "user-sub",
      clientId: "atlas",
      scope: "openid",
      parentSignInId: "sign-in-a",
    });
    const revoked = await call(
      deleteUserConsent,
      context,
      { method: "DELETE", url: "/consents/atlas", sessionId: "current" },
      "atlas"
    );
    assert.equal(revoked.statusCode, 204);
    assert.equal(await context.db.query.userClientConsents.findFirst(), undefined);
    assert.deepEqual(
      (await context.db.query.sessions.findMany()).map((row) => row.id),
      ["current"]
    );
  } finally {
    await cleanup();
  }
});

test("clients with rememberConsent disabled record no consent and never auto-finalize", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await insertSession(context, "current", signIn("sign-in-a"));
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      requireOrganizationSelection: false,
      rememberConsent: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid", "profile"],
    });
    const first = await authorize(context, {});
    await call(postAuthorizeFinalize, context, {
      method: "POST",
      url: "/authorize/finalize",
      sessionId: "current",
      body: new URLSearchParams({
        request_id: first.searchParams.get("request_id") as string,
        approve: "true",
      }),
    });
    assert.equal(await context.db.query.userClientConsents.findFirst(), undefined);
    assert.equal((await authorize(context, {})).searchParams.get("auto_finalize"), null);
  } finally {
    await cleanup();
  }
});

test("expired authorization requests are returned to the client's registered redirect", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid"],
    });

    const restarted = await call(postAuthorizeRestart, context, {
      method: "POST",
      url: "/authorize/restart",
      body: new URLSearchParams({
        client_id: "atlas",
        redirect_uri: "https://atlas.example/callback",
        state: "state-1",
      }),
    });
    assert.equal(restarted.statusCode, 200);
    const target = new URL((restarted.json as { redirect_url: string }).redirect_url);
    assert.equal(target.origin + target.pathname, "https://atlas.example/callback");
    assert.equal(target.searchParams.get("error"), "invalid_request");
    assert.equal(target.searchParams.get("state"), "state-1");

    const silent = await call(postAuthorizeRestart, context, {
      method: "POST",
      url: "/authorize/restart",
      body: new URLSearchParams({
        client_id: "atlas",
        redirect_uri: "https://atlas.example/callback",
        error: "interaction_required",
      }),
    });
    assert.equal(
      new URL((silent.json as { redirect_url: string }).redirect_url).searchParams.get("error"),
      "interaction_required"
    );

    await assert.rejects(
      call(postAuthorizeRestart, context, {
        method: "POST",
        url: "/authorize/restart",
        body: new URLSearchParams({
          client_id: "atlas",
          redirect_uri: "https://atlas.example/callback",
          error: "access_denied",
        }),
      })
    );

    await assert.rejects(
      call(postAuthorizeRestart, context, {
        method: "POST",
        url: "/authorize/restart",
        body: new URLSearchParams({
          client_id: "atlas",
          redirect_uri: "https://attacker.example/callback",
        }),
      })
    );

    await assert.rejects(
      call(postAuthorizeRestart, context, {
        method: "POST",
        url: "/authorize/restart",
        body: new URLSearchParams({
          client_id: "unknown",
          redirect_uri: "https://atlas.example/callback",
        }),
      })
    );
  } finally {
    await cleanup();
  }
});

test("prompt=select_account lets the user finish as a different account", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await context.db.insert(users).values({ sub: "other-sub", email: "other@example.com" });
    await context.db
      .insert(organizations)
      .values({ id: "33333333-3333-4333-8333-333333333333", slug: "three", name: "Three" });
    await context.db.insert(organizationMembers).values([
      {
        organizationId: "33333333-3333-4333-8333-333333333333",
        userSub: "user-sub",
        status: "active",
      },
      {
        organizationId: "33333333-3333-4333-8333-333333333333",
        userSub: "other-sub",
        status: "active",
      },
    ]);
    await insertSession(context, "current", signIn("sign-in-a"));
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid"],
    });

    const started = await authorize(context, { prompt: "select_account", scope: "openid" });
    const requestId = started.searchParams.get("request_id") as string;
    assert.equal(started.searchParams.get("prompt"), "select_account");
    assert.equal(
      (
        await context.db.query.pendingAuth.findFirst({
          where: eq(pendingAuth.requestId, requestId),
        })
      )?.userSub,
      null
    );

    await insertSession(context, "other", {
      sub: "other-sub",
      otpVerified: true,
      keyState: "unlocked",
      signInId: "sign-in-b",
      signInCreatedAt: new Date(Date.now() + 60_000).toISOString(),
      userAgent: "node-test",
    });

    const finalized = await call(postAuthorizeFinalize, context, {
      method: "POST",
      url: "/authorize/finalize",
      sessionId: "other",
      body: new URLSearchParams({ request_id: requestId, approve: "true" }),
    });
    assert.equal(finalized.statusCode, 200);
    const authCode = await context.db.query.authCodes.findFirst();
    assert.equal(authCode?.userSub, "other-sub");
  } finally {
    await cleanup();
  }
});

test("approving in a new organization does not carry scopes from the previous one", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await context.db.insert(organizations).values([
      { id: "11111111-1111-4111-8111-111111111111", slug: "one", name: "One" },
      { id: "22222222-2222-4222-8222-222222222222", slug: "two", name: "Two" },
    ]);
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid", "profile", "email"],
    });
    await recordUserClientConsent(context, {
      userSub: "user-sub",
      clientId: "atlas",
      scope: "openid profile",
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
    await recordUserClientConsent(context, {
      userSub: "user-sub",
      clientId: "atlas",
      scope: "openid",
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    const consent = await getUserClientConsent(context, "user-sub", "atlas");
    assert.equal(consent?.scopes, "openid");
    assert.equal(consent?.organizationId, "22222222-2222-4222-8222-222222222222");

    await recordUserClientConsent(context, {
      userSub: "user-sub",
      clientId: "atlas",
      scope: "email",
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(
      (await getUserClientConsent(context, "user-sub", "atlas"))?.scopes,
      "openid email"
    );
  } finally {
    await cleanup();
  }
});
