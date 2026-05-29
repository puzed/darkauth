import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { users } from "../db/schema.ts";
import type { Context } from "../types.ts";
import {
  createAccountKey,
  createKeyEnvelope,
  getActiveAccountKey,
  listKeyEnvelopes,
  migrateLegacyWrappedDrkToKeybag,
  revokeKeyEnvelope,
} from "./keybag.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-keybag-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUser(context: Context, sub = "user-sub") {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
}

test("keybag stores active account keys and envelopes without plaintext material", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createAccountKey(context, {
      keyId: "ark_user-sub_1",
      sub: "user-sub",
    });
    await createKeyEnvelope(context, {
      envelopeId: "env_user-sub_password_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      type: "password",
      label: "Password",
      wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      metadata: { version: "v2" },
    });

    const accountKey = await getActiveAccountKey(context, "user-sub");
    const envelopes = await listKeyEnvelopes(context, "user-sub");

    assert.equal(accountKey.keyId, "ark_user-sub_1");
    assert.equal(accountKey.version, "v2");
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.type, "password");
    assert.equal(Buffer.from(envelopes[0]?.wrappedKey || []).toString(), "wrapped-key");
    assert.deepEqual(envelopes[0]?.metadata, { version: "v2" });
  } finally {
    await cleanup();
  }
});

test("revokeKeyEnvelope hides revoked envelopes by default", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createAccountKey(context, {
      keyId: "ark_user-sub_1",
      sub: "user-sub",
    });
    await createKeyEnvelope(context, {
      envelopeId: "env_user-sub_password_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      type: "password",
      wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
    });

    await revokeKeyEnvelope(context, "env_user-sub_password_1", "user-sub");

    assert.deepEqual(await listKeyEnvelopes(context, "user-sub"), []);
    const all = await listKeyEnvelopes(context, "user-sub", { includeRevoked: true });
    assert.equal(all.length, 1);
    assert.ok(all[0]?.revokedAt);
  } finally {
    await cleanup();
  }
});

test("migrateLegacyWrappedDrkToKeybag creates deterministic legacy account key and envelope", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    const result = await migrateLegacyWrappedDrkToKeybag(context, {
      sub: "user-sub",
      wrappedDrk: Buffer.from("legacy-wrapped-drk"),
      updatedAt: new Date("2026-05-26T00:00:00.000Z"),
    });
    await migrateLegacyWrappedDrkToKeybag(context, {
      sub: "user-sub",
      wrappedDrk: Buffer.from("legacy-wrapped-drk"),
    });

    const accountKey = await getActiveAccountKey(context, "user-sub");
    const envelopes = await listKeyEnvelopes(context, "user-sub");

    assert.deepEqual(result, {
      keyId: "legacy-drk:user-sub",
      envelopeId: "legacy-drk-password:user-sub",
    });
    assert.equal(accountKey.version, "v1-drk");
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.wrappingAlg, "OPAQUE-HKDF-SHA256+A256GCM/v1");
    assert.deepEqual(envelopes[0]?.metadata, {
      version: "v1-drk",
      migrated_from: "wrapped_root_keys",
    });
  } finally {
    await cleanup();
  }
});
