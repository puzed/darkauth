import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../../db/pglite.ts";
import { auditLogs, emailVerificationTokens, sessions, users } from "../../db/schema.ts";
import { ValidationError } from "../../errors.ts";
import { createEmailVerificationToken } from "../../models/emailVerificationTokens.ts";
import type { Context } from "../../types.ts";
import {
  deleteUserProfilePendingEmail,
  getUserProfileController,
  postUserProfileEmailResend,
  putUserProfile,
} from "./profile.ts";

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

async function createDatabaseContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-profile-controller-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: { install: {} } } as unknown as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method?: string;
  url?: string;
  sessionId?: string;
  body?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method || "GET";
  request.url = options.url || "/profile";
  request.headers = {
    host: "localhost",
    cookie: options.sessionId ? `__Host-DarkAuth-User=${options.sessionId}` : "",
    "user-agent": "node-test",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  let body = "";
  return {
    statusCode: 0,
    setHeader() {
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get json() {
      return JSON.parse(body);
    },
  } as ServerResponse & { body: string; json: unknown };
}

async function insertUserSession(context: Context, sessionId = "profile-session") {
  await context.db.insert(users).values({
    sub: "profile-user",
    email: "profile@example.com",
    opaqueLoginIdentity: "login@example.com",
    name: "Profile User",
    emailVerifiedAt: new Date("2026-05-30T10:00:00.000Z"),
    pendingEmail: "pending@example.com",
    pendingEmailSetAt: new Date("2026-05-30T11:00:00.000Z"),
  });
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: "profile-user",
    expiresAt: new Date(Date.now() + 60_000),
    data: {
      sub: "profile-user",
      email: "stale@example.com",
      name: "Stale Name",
    },
  });
}

test("getUserProfileController returns editable profile state", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    await insertUserSession(context);
    const request = createRequest({ sessionId: "profile-session" });
    const response = createResponse();

    await getUserProfileController(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      sub: "profile-user",
      email: "profile@example.com",
      name: "Profile User",
      emailVerified: true,
      emailVerifiedAt: "2026-05-30T10:00:00.000Z",
      pendingEmail: "pending@example.com",
      pendingEmailSetAt: "2026-05-30T11:00:00.000Z",
      signInEmail: "login@example.com",
    });
  } finally {
    await cleanup();
  }
});

test("putUserProfile updates name and live session data", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    await insertUserSession(context);
    const request = createRequest({
      method: "PUT",
      sessionId: "profile-session",
      body: JSON.stringify({ name: " Updated Name " }),
    });
    const response = createResponse();

    await putUserProfile(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.equal((response.json as { name?: string }).name, "Updated Name");
    const session = await context.db.query.sessions.findFirst({
      where: eq(sessions.id, "profile-session"),
    });
    assert.equal((session?.data as { name?: string }).name, "Updated Name");
    const audit = await context.db.query.auditLogs.findFirst({
      where: eq(auditLogs.eventType, "USER_PROFILE_NAME_UPDATED"),
    });
    assert.equal(audit?.userId, "profile-user");
  } finally {
    await cleanup();
  }
});

test("deleteUserProfilePendingEmail clears pending email and invalidates active tokens", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    await insertUserSession(context);
    await createEmailVerificationToken(context, {
      userSub: "profile-user",
      purpose: "email_change_verify",
      targetEmail: "pending@example.com",
      ttlMinutes: 30,
    });
    const request = createRequest({
      method: "DELETE",
      url: "/profile/email/pending",
      sessionId: "profile-session",
    });
    const response = createResponse();

    await deleteUserProfilePendingEmail(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.equal((response.json as { pendingEmail?: string | null }).pendingEmail, null);
    const user = await context.db.query.users.findFirst({ where: eq(users.sub, "profile-user") });
    assert.equal(user?.pendingEmail, null);
    assert.equal(user?.pendingEmailSetAt, null);
    const token = await context.db.query.emailVerificationTokens.findFirst({
      where: eq(emailVerificationTokens.userSub, "profile-user"),
    });
    assert.ok(token?.consumedAt);
  } finally {
    await cleanup();
  }
});

test("postUserProfileEmailResend uses the authenticated pending email only", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    await insertUserSession(context);
    const request = createRequest({
      method: "POST",
      url: "/profile/email/resend",
      sessionId: "profile-session",
      body: JSON.stringify({ email: "attacker@example.com" }),
    });
    const response = createResponse();

    await assert.rejects(
      () => postUserProfileEmailResend(context, request, response),
      (error: unknown) =>
        error instanceof ValidationError && error.message === "Email transport is not available"
    );
    const user = await context.db.query.users.findFirst({ where: eq(users.sub, "profile-user") });
    assert.equal(user?.pendingEmail, "pending@example.com");
  } finally {
    await cleanup();
  }
});
