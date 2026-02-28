import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { sessions, users } from "../db/schema.ts";
import type { Context } from "../types.ts";
import { sha256Base64Url } from "../utils/crypto.ts";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  clearSessionCookies,
  createSession,
  getActorFromRefreshToken,
  getSession,
  getSessionId,
  getSessionIdFromCookie,
  issueSessionCookies,
  refreshSessionWithToken,
} from "./sessions.ts";

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

test("createSession stores a hashed refresh token", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    const created = await createSession(context, "user", { sub: "user-1" });
    const stored = await db.query.sessions.findFirst({ where: eq(sessions.id, created.sessionId) });

    assert.ok(stored);
    assert.notEqual(stored.refreshToken, created.refreshToken);
    assert.equal(stored.refreshToken, sha256Base64Url(created.refreshToken));
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("refreshSessionWithToken allows only one success for concurrent refresh", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    const created = await createSession(context, "user", { sub: "user-1" });
    const [first, second] = await Promise.all([
      refreshSessionWithToken(context, created.refreshToken),
      refreshSessionWithToken(context, created.refreshToken),
    ]);
    const successful = [first, second].filter((value) => value !== null);

    assert.equal(successful.length, 1);
    assert.equal(await refreshSessionWithToken(context, created.refreshToken), null);
    assert.ok(successful[0]);
    const activeSession = await getSession(context, successful[0].sessionId);
    assert.ok(activeSession);
    assert.equal(activeSession.sub, "user-1");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("getActorFromRefreshToken resolves actor using hashed token storage", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    const created = await createSession(context, "user", { sub: "user-1" });
    const actor = await getActorFromRefreshToken(context, created.refreshToken);

    assert.ok(actor);
    assert.equal(actor.userSub, "user-1");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("issueSessionCookies sets host-prefixed auth and csrf cookies", () => {
  let setCookie: string[] = [];
  const response = {
    getHeader(name: string) {
      if (name === "Set-Cookie") return setCookie;
      return undefined;
    },
    setHeader(name: string, value: string[]) {
      if (name === "Set-Cookie") setCookie = value;
    },
  } as unknown as import("node:http").ServerResponse;

  issueSessionCookies(response, "session-1", 900, "csrf-1");

  assert.equal(setCookie.length, 2);
  assert.ok(setCookie.some((value) => value.startsWith(`${AUTH_COOKIE_NAME}=session-1`)));
  assert.ok(setCookie.some((value) => value.startsWith(`${CSRF_COOKIE_NAME}=csrf-1`)));
  assert.ok(setCookie.every((value) => value.includes("Path=/")));
  assert.ok(setCookie.every((value) => value.includes("SameSite=Lax")));
  assert.ok(setCookie.every((value) => value.includes("Secure")));
});

test("clearSessionCookies expires auth and csrf cookies", () => {
  let setCookie: string[] = [];
  const response = {
    getHeader(name: string) {
      if (name === "Set-Cookie") return setCookie;
      return undefined;
    },
    setHeader(name: string, value: string[]) {
      if (name === "Set-Cookie") setCookie = value;
    },
  } as unknown as import("node:http").ServerResponse;

  clearSessionCookies(response);

  assert.equal(setCookie.length, 2);
  assert.ok(setCookie.some((value) => value.startsWith(`${AUTH_COOKIE_NAME}=`)));
  assert.ok(setCookie.some((value) => value.startsWith(`${CSRF_COOKIE_NAME}=`)));
  assert.ok(setCookie.every((value) => value.includes("Max-Age=0")));
});

test("getSessionIdFromCookie tolerates malformed cookie encoding", () => {
  const request = {
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=abc%ZZ`,
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionIdFromCookie(request), "abc%ZZ");
});

test("getSession falls back to bearer header when cookie is missing", () => {
  const request = {
    headers: {
      authorization: "Bearer session-from-header",
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionId(request), "session-from-header");
});

test("getSession prefers cookie over bearer header", () => {
  const request = {
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=cookie-session`,
      authorization: "Bearer header-session",
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionId(request), "cookie-session");
});
