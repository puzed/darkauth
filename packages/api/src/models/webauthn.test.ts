import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { users } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { createAccountKey, listKeyEnvelopes } from "./keybag.ts";
import {
  consumeWebAuthnChallenge,
  createPasskeyPrfEnvelope,
  createWebAuthnChallenge,
  createWebAuthnCredential,
  credentialCanUnlockWithPrf,
  listWebAuthnCredentials,
  revokeWebAuthnCredential,
} from "./webauthn.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-webauthn-model-test-"));
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

test("webauthn challenges are single use and typed", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    const created = await createWebAuthnChallenge(context, {
      type: "registration",
      sub: "user-sub",
      metadata: { prf_salt: "salt" },
    });

    const consumed = await consumeWebAuthnChallenge(context, {
      challenge: created.challenge,
      type: "registration",
    });

    assert.equal(consumed.challengeId, created.challengeId);
    await assert.rejects(
      () =>
        consumeWebAuthnChallenge(context, { challenge: created.challenge, type: "registration" }),
      /WebAuthn challenge not found/
    );
  } finally {
    await cleanup();
  }
});

test("passkey credentials model auth-only passkeys separately from PRF unlock passkeys", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createAccountKey(context, { keyId: "ark_user-sub_1", sub: "user-sub" });
    const authOnly = await createWebAuthnCredential(context, {
      credentialId: "cred-auth-only",
      sub: "user-sub",
      publicKey: Buffer.from("public-key"),
      prfSupported: false,
    });
    await createWebAuthnCredential(context, {
      credentialId: "cred-prf",
      sub: "user-sub",
      publicKey: Buffer.from("public-key-prf"),
      prfSupported: true,
      transports: ["internal", "hybrid"],
    });

    assert.equal(credentialCanUnlockWithPrf(authOnly), false);
    await assert.rejects(
      () =>
        createPasskeyPrfEnvelope(context, {
          credentialId: "cred-auth-only",
          sub: "user-sub",
          keyId: "ark_user-sub_1",
          envelopeId: "env_auth_only",
          wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM",
          wrappedKey: Buffer.from("wrapped-key"),
          aad: Buffer.from("aad"),
          prfSalt: Buffer.from("prf-salt"),
          prfResultConfirmed: true,
        }),
      ValidationError
    );

    await assert.rejects(
      () =>
        createPasskeyPrfEnvelope(context, {
          credentialId: "cred-prf",
          sub: "user-sub",
          keyId: "ark_user-sub_1",
          envelopeId: "env_missing_confirmation",
          wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM",
          wrappedKey: Buffer.from("wrapped-key"),
          aad: Buffer.from("aad"),
          prfSalt: Buffer.from("prf-salt"),
          prfResultConfirmed: false,
        }),
      ValidationError
    );

    const envelope = await createPasskeyPrfEnvelope(context, {
      credentialId: "cred-prf",
      sub: "user-sub",
      keyId: "ark_user-sub_1",
      envelopeId: "env_prf",
      wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      prfSalt: Buffer.from("prf-salt"),
      prfResultConfirmed: true,
    });

    const credentials = await listWebAuthnCredentials(context, "user-sub");
    const envelopes = await listKeyEnvelopes(context, "user-sub", { type: "passkey_prf" });
    const prfCredential = credentials.find((credential) => credential.credentialId === "cred-prf");

    assert.equal(envelope.envelopeId, "env_prf");
    assert.equal(envelopes.length, 1);
    assert.equal(prfCredential?.prfEnvelopeId, "env_prf");
    assert.equal(prfCredential ? credentialCanUnlockWithPrf(prfCredential) : false, true);
  } finally {
    await cleanup();
  }
});

test("revoking a passkey also revokes its PRF envelope", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUser(context);
    await createAccountKey(context, { keyId: "ark_user-sub_1", sub: "user-sub" });
    await createWebAuthnCredential(context, {
      credentialId: "cred-prf",
      sub: "user-sub",
      publicKey: Buffer.from("public-key-prf"),
      prfSupported: true,
    });
    await createPasskeyPrfEnvelope(context, {
      credentialId: "cred-prf",
      sub: "user-sub",
      keyId: "ark_user-sub_1",
      envelopeId: "env_prf",
      wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      prfSalt: Buffer.from("prf-salt"),
      prfResultConfirmed: true,
    });

    const revoked = await revokeWebAuthnCredential(context, {
      credentialId: "cred-prf",
      sub: "user-sub",
    });
    const activeCredentials = await listWebAuthnCredentials(context, "user-sub");
    const activeEnvelopes = await listKeyEnvelopes(context, "user-sub", { type: "passkey_prf" });

    assert.equal(revoked.credentialId, "cred-prf");
    assert.ok(revoked.revokedAt);
    assert.equal(activeCredentials.length, 0);
    assert.equal(activeEnvelopes.length, 0);
  } finally {
    await cleanup();
  }
});
