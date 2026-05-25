import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { passwordResetTokens, users } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import {
  createPasswordResetToken,
  getActivePasswordResetToken,
  invalidateActivePasswordResetTokens,
  type PasswordResetTokenRow,
} from "./passwordResetTokens.ts";

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

async function ensurePasswordResetTokenTable(client: { query: (sql: string) => Promise<unknown> }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_sub text NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
      email text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamp NOT NULL,
      consumed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      requested_ip_hash text,
      user_agent_hash text
    )
  `);
  await client.query(
    "CREATE INDEX IF NOT EXISTS password_reset_tokens_user_sub_idx ON password_reset_tokens(user_sub)"
  );
  await client.query(
    "CREATE INDEX IF NOT EXISTS password_reset_tokens_active_user_idx ON password_reset_tokens(user_sub, consumed_at)"
  );
}

async function findActiveToken(
  context: Context,
  token: string
): Promise<PasswordResetTokenRow | null> {
  try {
    return await getActivePasswordResetToken(context, token);
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

test("createPasswordResetToken stores only token hashes and invalidates older active tokens", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-password-reset-token-test-"));
  const { db, client, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await ensurePasswordResetTokenTable(client);
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });

    const first = await createPasswordResetToken(context, {
      userSub: "user-1",
      email: "user-1@example.com",
      ttlMinutes: 30,
    });
    const second = await createPasswordResetToken(context, {
      userSub: "user-1",
      email: "user-1@example.com",
      ttlMinutes: 30,
    });

    assert.notEqual(first.token, second.token);
    assert.match(first.token, /^[A-Za-z0-9_-]{43,}$/);
    assert.match(second.token, /^[A-Za-z0-9_-]{43,}$/);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userSub, "user-1"));
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.consumedAt === null).length, 1);
    assert.ok(rows.every((row) => row.tokenHash !== first.token));
    assert.ok(rows.every((row) => row.tokenHash !== second.token));

    assert.equal(await findActiveToken(context, first.token), null);
    const active = await findActiveToken(context, second.token);
    assert.equal(active?.userSub, "user-1");
    assert.equal(active?.email, "user-1@example.com");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalidateActivePasswordResetTokens and expiry prevent token validation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-password-reset-token-test-"));
  const { db, client, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await ensurePasswordResetTokenTable(client);
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    await db.insert(users).values({ sub: "user-2", email: "user-2@example.com", name: "User Two" });

    const active = await createPasswordResetToken(context, {
      userSub: "user-1",
      email: "user-1@example.com",
      ttlMinutes: 30,
    });

    assert.equal((await findActiveToken(context, active.token))?.userSub, "user-1");
    await invalidateActivePasswordResetTokens(context, "user-1");
    assert.equal(await findActiveToken(context, active.token), null);

    const expired = await createPasswordResetToken(context, {
      userSub: "user-2",
      email: "user-2@example.com",
      ttlMinutes: 30,
    });
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userSub, "user-2"));

    assert.equal(await findActiveToken(context, expired.token), null);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
