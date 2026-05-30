import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { sessions, users } from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { createEmailVerificationToken } from "../models/emailVerificationTokens.ts";
import type { Context } from "../types.ts";
import {
  consumeVerificationTokenAndApply,
  ensureRegistrationAllowedForVerification,
  getVerificationTokenTtlMinutes,
} from "./emailVerification.ts";

function createContext(values: unknown[]): Context {
  let index = 0;
  return {
    db: {
      query: {
        settings: {
          findFirst: async () => ({ value: values[index++] }),
        },
      },
    },
    services: {},
    config: {
      publicOrigin: "https://auth.example.com",
    },
    logger: {
      error() {},
      warn() {},
      info() {},
      debug() {},
      trace() {},
      fatal() {},
    },
  } as unknown as Context;
}

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

test("getVerificationTokenTtlMinutes clamps out-of-range settings", async () => {
  const low = createContext([1]);
  const high = createContext([20000]);
  const valid = createContext([120]);

  assert.equal(await getVerificationTokenTtlMinutes(low), 5);
  assert.equal(await getVerificationTokenTtlMinutes(high), 10080);
  assert.equal(await getVerificationTokenTtlMinutes(valid), 120);
});

test("ensureRegistrationAllowedForVerification blocks when verification is required without email transport", async () => {
  const blocked = createContext([true, false, "smtp", "", "", 0, "", ""]);
  const allowed = createContext([false]);

  await assert.rejects(
    () => ensureRegistrationAllowedForVerification(blocked),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "REGISTRATION_DISABLED" &&
      error.message === "Registration currently disabled"
  );
  await assert.doesNotReject(() => ensureRegistrationAllowedForVerification(allowed));
});

test("consumeVerificationTokenAndApply changes contact email while preserving OPAQUE sign-in identity", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-email-verify-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    logger: createLogger(),
    config: { publicOrigin: "https://auth.example.com" },
  } as unknown as Context;

  try {
    await db.insert(users).values({
      sub: "email-change-user",
      email: "old@example.com",
      opaqueLoginIdentity: "old@example.com",
      name: "Email Change User",
      pendingEmail: "new@example.com",
      pendingEmailSetAt: new Date("2026-05-30T11:00:00.000Z"),
    });
    await db.insert(sessions).values({
      id: "email-change-session",
      cohort: "user",
      userSub: "email-change-user",
      expiresAt: new Date(Date.now() + 60_000),
      data: {
        sub: "email-change-user",
        email: "old@example.com",
        name: "Email Change User",
      },
    });
    const created = await createEmailVerificationToken(context, {
      userSub: "email-change-user",
      purpose: "email_change_verify",
      targetEmail: "new@example.com",
      ttlMinutes: 30,
    });

    const result = await consumeVerificationTokenAndApply(context, created.token);

    assert.equal(result.purpose, "email_change_verify");
    const user = await db.query.users.findFirst({ where: eq(users.sub, "email-change-user") });
    assert.equal(user?.email, "new@example.com");
    assert.equal(user?.opaqueLoginIdentity, "old@example.com");
    assert.equal(user?.pendingEmail, null);
    assert.ok(user?.emailVerifiedAt);
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, "email-change-session"),
    });
    assert.equal((session?.data as { email?: string }).email, "new@example.com");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
