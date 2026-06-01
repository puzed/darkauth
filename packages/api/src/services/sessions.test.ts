import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { organizationMembers, organizations, scimUsers, sessions, users } from "../db/schema.ts";
import { UnauthorizedError } from "../errors.ts";
import type { Context } from "../types.ts";
import { sha256Base64Url } from "../utils/crypto.ts";
import {
  ADMIN_AUTH_COOKIE_NAME,
  ADMIN_CSRF_COOKIE_NAME,
  clearSessionCookies,
  createSession,
  getActorFromRefreshToken,
  getSession,
  getSessionId,
  getSessionIdFromCookie,
  issueSessionCookies,
  refreshSessionWithToken,
  requireSession,
  USER_AUTH_COOKIE_NAME,
  USER_CSRF_COOKIE_NAME,
} from "./sessions.ts";
import { setSetting } from "./settings.ts";

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

test("createSession updates user last activity", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    await createSession(context, "user", { sub: "user-1" });
    const user = await db.query.users.findFirst({ where: eq(users.sub, "user-1") });

    assert.ok(user?.lastActivityAt);
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

test("refreshSessionWithToken updates user last activity", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    const oldActivity = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(users).values({
      sub: "user-1",
      email: "user-1@example.com",
      name: "User One",
      lastActivityAt: oldActivity,
    });
    const created = await createSession(context, "user", { sub: "user-1" });
    await db.update(users).set({ lastActivityAt: oldActivity }).where(eq(users.sub, "user-1"));
    await refreshSessionWithToken(context, created.refreshToken);
    const user = await db.query.users.findFirst({ where: eq(users.sub, "user-1") });

    assert.ok(user?.lastActivityAt);
    assert.ok(user.lastActivityAt > oldActivity);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("SCIM only-provisioned policy blocks user session creation and refresh", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await db.insert(users).values({
      sub: "local-user",
      email: "local-user@example.com",
      name: "Local User",
    });
    await setSetting(context, "users.scim.only_provisioned_sign_in", true);

    await assert.rejects(
      () => createSession(context, "user", { sub: "local-user" }),
      (error: unknown) => error instanceof UnauthorizedError
    );

    await db.insert(scimUsers).values({
      userSub: "local-user",
      userName: "local-user@example.com",
      active: true,
    });
    const created = await createSession(context, "user", { sub: "local-user" });
    await db.delete(scimUsers).where(eq(scimUsers.userSub, "local-user"));

    await assert.rejects(
      () => refreshSessionWithToken(context, created.refreshToken),
      (error: unknown) => error instanceof UnauthorizedError
    );
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

test("requireSession enforces current forced OTP policy", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-sessions-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({
      sub: "otp-policy-user",
      email: "otp-policy-user@example.com",
      name: "OTP Policy",
    });
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "otp-policy-org", name: "OTP Policy", forceOtp: true })
      .returning();
    assert.ok(organization);
    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userSub: "otp-policy-user",
      status: "active",
    });
    await db.insert(sessions).values({
      id: "otp-policy-session",
      cohort: "user",
      userSub: "otp-policy-user",
      expiresAt: new Date(Date.now() + 60_000),
      data: {
        sub: "otp-policy-user",
        otpRequired: false,
        otpVerified: false,
      },
    });
    const request = {
      url: "/crypto/wrapped-drk",
      headers: {
        host: "localhost",
        cookie: `${USER_AUTH_COOKIE_NAME}=otp-policy-session`,
      },
    } as unknown as import("node:http").IncomingMessage;

    await assert.rejects(
      () => requireSession(context, request, false),
      (error: unknown) =>
        error instanceof UnauthorizedError && error.message === "OTP verification required"
    );
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

  issueSessionCookies(response, "session-1", 900, false, "csrf-1");

  assert.equal(setCookie.length, 2);
  assert.ok(setCookie.some((value) => value.startsWith(`${USER_AUTH_COOKIE_NAME}=session-1`)));
  assert.ok(setCookie.some((value) => value.startsWith(`${USER_CSRF_COOKIE_NAME}=csrf-1`)));
  assert.ok(setCookie.every((value) => value.includes("Path=/")));
  assert.ok(setCookie.every((value) => value.includes("SameSite=Lax")));
  assert.ok(setCookie.every((value) => value.includes("Secure")));
});

test("issueSessionCookies sets admin auth and csrf cookies when admin cohort is passed", () => {
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

  issueSessionCookies(response, "admin-session", 900, true, "admin-csrf");

  assert.equal(setCookie.length, 2);
  assert.ok(setCookie.some((value) => value.startsWith(`${ADMIN_AUTH_COOKIE_NAME}=admin-session`)));
  assert.ok(setCookie.some((value) => value.startsWith(`${ADMIN_CSRF_COOKIE_NAME}=admin-csrf`)));
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
  assert.ok(setCookie.some((value) => value.startsWith(`${USER_AUTH_COOKIE_NAME}=`)));
  assert.ok(setCookie.some((value) => value.startsWith(`${USER_CSRF_COOKIE_NAME}=`)));
  assert.ok(setCookie.every((value) => value.includes("Max-Age=0")));
});

test("getSessionIdFromCookie tolerates malformed cookie encoding", () => {
  const request = {
    headers: {
      cookie: `${USER_AUTH_COOKIE_NAME}=abc%ZZ`,
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionIdFromCookie(request), "abc%ZZ");
});

test("getSession ignores bearer header when cookie is missing", () => {
  const request = {
    headers: {
      authorization: "Bearer session-from-header",
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionId(request), null);
});

test("getSession prefers cookie over bearer header", () => {
  const request = {
    headers: {
      cookie: `${USER_AUTH_COOKIE_NAME}=cookie-session`,
      authorization: "Bearer header-session",
    },
  } as unknown as import("node:http").IncomingMessage;

  assert.equal(getSessionId(request), "cookie-session");
});
