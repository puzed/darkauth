import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { emailVerificationTokens, users } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
} from "./emailVerificationTokens.ts";

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

test("createEmailVerificationToken invalidates active tokens for same user and purpose", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-email-token-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });

    const first = await createEmailVerificationToken(context, {
      userSub: "user-1",
      purpose: "signup_verify",
      targetEmail: "user-1@example.com",
      ttlMinutes: 30,
    });
    const second = await createEmailVerificationToken(context, {
      userSub: "user-1",
      purpose: "signup_verify",
      targetEmail: "user-1@example.com",
      ttlMinutes: 30,
    });

    assert.notEqual(first.token, second.token);

    const rows = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userSub, "user-1"));
    assert.equal(rows.length, 2);
    const activeRows = rows.filter((row) => row.consumedAt === null);
    assert.equal(activeRows.length, 1);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("consumeEmailVerificationToken consumes once and rejects reuse", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-email-token-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });

    const created = await createEmailVerificationToken(context, {
      userSub: "user-1",
      purpose: "email_change_verify",
      targetEmail: "new@example.com",
      ttlMinutes: 30,
    });

    const consumed = await consumeEmailVerificationToken(context, created.token);
    assert.equal(consumed.userSub, "user-1");
    assert.equal(consumed.purpose, "email_change_verify");
    assert.equal(consumed.targetEmail, "new@example.com");

    await assert.rejects(
      () => consumeEmailVerificationToken(context, created.token),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.message === "Verification link is invalid or expired"
    );
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
