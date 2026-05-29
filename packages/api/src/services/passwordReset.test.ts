import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { opaqueRecords, users } from "../db/schema.ts";
import { createAccountKey, createKeyEnvelope, listKeyEnvelopes } from "../models/keybag.ts";
import { createPasswordResetToken } from "../models/passwordResetTokens.ts";
import type { Context } from "../types.ts";
import {
  finishPasswordResetRegistration,
  getPasswordResetTokenTtlMinutes,
  normalizePasswordResetEmail,
  PASSWORD_RESET_GENERIC_MESSAGE,
  requestPasswordResetEmail,
  shouldShowPasswordResetLink,
} from "./passwordReset.ts";

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

function createContext(values: unknown[]): Context {
  let index = 0;
  return {
    db: {
      query: {
        settings: {
          findFirst: async () => ({ value: values[index++] }),
        },
      },
      insert: () => ({
        values: async () => {},
      }),
    },
    config: {
      publicOrigin: "https://auth.example.com",
    },
    services: {},
    logger: createLogger(),
  } as unknown as Context;
}

async function createDatabaseContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-password-reset-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    config: {
      publicOrigin: "https://auth.example.com",
      kekPassphrase: "test-pepper",
    },
    services: {},
    logger: createLogger(),
  } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

test("getPasswordResetTokenTtlMinutes clamps out-of-range settings", async () => {
  const low = createContext([1]);
  const high = createContext([20000]);
  const valid = createContext([120]);

  assert.equal(await getPasswordResetTokenTtlMinutes(low), 5);
  assert.equal(await getPasswordResetTokenTtlMinutes(high), 1440);
  assert.equal(await getPasswordResetTokenTtlMinutes(valid), 120);
});

test("requestPasswordResetEmail returns generic success when disabled", async () => {
  const context = createContext([false]);

  const response = await requestPasswordResetEmail(context, {
    email: " User@Example.COM ",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });

  assert.deepEqual(response, { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
  assert.equal(normalizePasswordResetEmail(" User@Example.COM "), "user@example.com");
});

test("requestPasswordResetEmail returns generic success when smtp is unavailable", async () => {
  const context = createContext([true, false]);

  const response = await requestPasswordResetEmail(context, {
    email: "user@example.com",
    ipAddress: "127.0.0.1",
  });

  assert.deepEqual(response, { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
});

test("shouldShowPasswordResetLink requires visible setting and available email", async () => {
  const hidden = createContext([false]);
  const visible = createContext([
    true,
    true,
    true,
    "smtp",
    "DarkAuth <noreply@example.com>",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);

  assert.equal(await shouldShowPasswordResetLink(hidden), false);
  assert.equal(await shouldShowPasswordResetLink(visible), true);
});

test("finishPasswordResetRegistration replaces auth credentials without rewrapping ARK envelopes", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    await context.db.insert(users).values({
      sub: "user-a",
      email: "user-a@example.com",
      name: "User A",
    });
    await context.db.insert(opaqueRecords).values({
      sub: "user-a",
      envelope: Buffer.from("old-opaque-envelope"),
      serverPubkey: Buffer.from("old-opaque-server-pubkey"),
    });
    await createAccountKey(context, { keyId: "ark_user-a_1", sub: "user-a" });
    await createKeyEnvelope(context, {
      envelopeId: "env_user-a_password_1",
      keyId: "ark_user-a_1",
      sub: "user-a",
      type: "password",
      wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("old-password-wrapped-ark"),
      aad: Buffer.from("password-aad"),
      metadata: { source: "password-export-key" },
    });
    await createKeyEnvelope(context, {
      envelopeId: "env_user-a_recovery_1",
      keyId: "ark_user-a_1",
      sub: "user-a",
      type: "recovery",
      wrappingAlg: "Recovery-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("recovery-wrapped-ark"),
      aad: Buffer.from("recovery-aad"),
      metadata: { source: "offline-recovery" },
    });
    const { token } = await createPasswordResetToken(context, {
      userSub: "user-a",
      email: "user-a@example.com",
      ttlMinutes: 30,
    });
    let finishIdentity = "";
    context.services.opaque = {
      finishRegistration: async (recordBuffer: Uint8Array, identityU: string) => {
        finishIdentity = identityU;
        assert.deepEqual([...recordBuffer], [7, 8, 9]);
        return {
          envelope: new Uint8Array([1, 2, 3]),
          serverPublicKey: new Uint8Array([4, 5, 6]),
        };
      },
    };

    await finishPasswordResetRegistration(context, {
      token,
      recordBuffer: new Uint8Array([7, 8, 9]),
      exportKeyHash: "new-export-key-hash",
      ipAddress: "127.0.0.1",
    });

    const opaqueRecord = await context.db.query.opaqueRecords.findFirst();
    const envelopes = await listKeyEnvelopes(context, "user-a");

    assert.equal(finishIdentity, "user-a@example.com");
    assert.deepEqual([...(opaqueRecord?.envelope || [])], [1, 2, 3]);
    assert.deepEqual([...(opaqueRecord?.serverPubkey || [])], [4, 5, 6]);
    assert.equal(envelopes.length, 2);
    assert.deepEqual(
      envelopes
        .map((envelope) => [
          envelope.envelopeId,
          envelope.type,
          Buffer.from(envelope.wrappedKey || []).toString(),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [
        ["env_user-a_password_1", "password", "old-password-wrapped-ark"],
        ["env_user-a_recovery_1", "recovery", "recovery-wrapped-ark"],
      ]
    );
  } finally {
    await cleanup();
  }
});
