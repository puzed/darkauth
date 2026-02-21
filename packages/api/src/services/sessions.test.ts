import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.js";
import { sessions, users } from "../db/schema.js";
import type { Context } from "../types.js";
import { sha256Base64Url } from "../utils/crypto.js";
import {
  createSession,
  getActorFromRefreshToken,
  getSession,
  refreshSessionWithToken,
} from "./sessions.js";

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
