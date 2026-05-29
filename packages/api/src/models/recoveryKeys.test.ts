import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { keyEnvelopes, recoveryKeys, users } from "../db/schema.ts";
import { ForbiddenError } from "../errors.ts";
import type { Context } from "../types.ts";
import { createAccountKey } from "./keybag.ts";
import {
  createRecoveryKey,
  listRecoveryKeys,
  recordRecoveryKeyUse,
  revokeRecoveryKey,
} from "./recoveryKeys.ts";

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

async function withContext(run: (context: Context) => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-recovery-keys-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  try {
    await run(context);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function createUserAndAccountKey(context: Context, sub = "user-sub") {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
  await createAccountKey(context, { keyId: `ark_${sub}_1`, sub });
}

function verifier(value = "recovery verifier material") {
  return Buffer.from(value.padEnd(32, ".").slice(0, 32));
}

test("createRecoveryKey stores only a verifier hash and recovery envelope ciphertext", async () => {
  await withContext(async (context) => {
    await createUserAndAccountKey(context);
    const plainVerifier = verifier();

    const created = await createRecoveryKey(context, {
      recoveryKeyId: "rk_user_1",
      envelopeId: "env_user_recovery_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      label: "Paper key",
      wrappingAlg: "HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-recovery-envelope"),
      aad: Buffer.from("canonical-aad"),
      verifier: plainVerifier,
      metadata: { version: "v2" },
    });

    const row = await context.db.query.recoveryKeys.findFirst({
      where: eq(recoveryKeys.recoveryKeyId, "rk_user_1"),
    });
    const envelope = await context.db.query.keyEnvelopes.findFirst({
      where: eq(keyEnvelopes.envelopeId, "env_user_recovery_1"),
    });

    assert.equal(created.recoveryKey.recoveryKeyId, "rk_user_1");
    assert.ok(row?.verifierHash.startsWith("$argon2"));
    assert.notEqual(row?.verifierHash, plainVerifier.toString("base64url"));
    assert.equal(JSON.stringify(row).includes(plainVerifier.toString("utf8")), false);
    assert.equal(envelope?.type, "recovery");
    assert.equal(Buffer.from(envelope?.wrappedKey || []).toString(), "wrapped-recovery-envelope");
  });
});

test("revokeRecoveryKey hides recovery keys and revokes their envelope", async () => {
  await withContext(async (context) => {
    await createUserAndAccountKey(context);
    await createRecoveryKey(context, {
      recoveryKeyId: "rk_user_1",
      envelopeId: "env_user_recovery_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      wrappingAlg: "HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-recovery-envelope"),
      aad: Buffer.from("canonical-aad"),
      verifier: verifier(),
    });

    const revoked = await revokeRecoveryKey(context, {
      sub: "user-sub",
      recoveryKeyId: "rk_user_1",
    });

    assert.ok(revoked.recoveryKey.revokedAt);
    assert.ok(revoked.envelope.revokedAt);
    assert.deepEqual(await listRecoveryKeys(context, "user-sub"), []);
    assert.equal((await listRecoveryKeys(context, "user-sub", { includeRevoked: true })).length, 1);
  });
});

test("recordRecoveryKeyUse verifies the hash and updates recovery key and envelope usage", async () => {
  await withContext(async (context) => {
    await createUserAndAccountKey(context);
    const validVerifier = verifier();
    await createRecoveryKey(context, {
      recoveryKeyId: "rk_user_1",
      envelopeId: "env_user_recovery_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      wrappingAlg: "HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-recovery-envelope"),
      aad: Buffer.from("canonical-aad"),
      verifier: validVerifier,
    });

    await assert.rejects(
      () =>
        recordRecoveryKeyUse(context, {
          sub: "user-sub",
          recoveryKeyId: "rk_user_1",
          verifier: verifier("wrong verifier material"),
        }),
      (error: unknown) => error instanceof ForbiddenError
    );

    const used = await recordRecoveryKeyUse(context, {
      sub: "user-sub",
      recoveryKeyId: "rk_user_1",
      verifier: validVerifier,
    });

    assert.ok(used.recoveryKey.lastUsedAt);
    assert.ok(used.envelope.lastUsedAt);
  });
});
