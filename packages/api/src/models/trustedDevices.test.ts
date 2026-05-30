import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { scimUsers, users } from "../db/schema.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import { setSetting } from "../services/settings.ts";
import type { Context } from "../types.ts";
import { sha256Base64Url } from "../utils/crypto.ts";
import { createAccountKey, createKeyEnvelope, listKeyEnvelopes } from "./keybag.ts";
import {
  approveDeviceApprovalRequest,
  consumeDeviceApprovalRequest,
  createDeviceApprovalRequest,
  createTrustedDevice,
  denyDeviceApprovalRequest,
  listDeviceApprovalRequests,
  listTrustedDevices,
  revokeTrustedDevice,
} from "./trustedDevices.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-trusted-device-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  try {
    await run(context);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function createUser(context: Context, sub = "user-sub") {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
}

async function createTrustedDeviceEnvelope(context: Context, sub = "user-sub") {
  await createAccountKey(context, { keyId: `ark_${sub}_1`, sub });
  await createKeyEnvelope(context, {
    envelopeId: `env_${sub}_device_1`,
    keyId: `ark_${sub}_1`,
    sub,
    type: "trusted_device",
    wrappingAlg: "ECDH-ES+A256GCM",
    wrappedKey: Buffer.from("wrapped-device-key"),
    aad: Buffer.from("aad"),
  });
}

test("trusted devices require active trusted-device envelopes and can be revoked", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);

    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      label: "MacBook",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      keyHandle: "indexeddb-key",
      envelopeId: "env_user-sub_device_1",
    });

    assert.equal(device.label, "MacBook");
    assert.equal((await listTrustedDevices(context, "user-sub")).length, 1);

    await revokeTrustedDevice(context, { sub: "user-sub", deviceId: device.deviceId });

    assert.equal((await listTrustedDevices(context, "user-sub")).length, 0);
    assert.equal((await listTrustedDevices(context, "user-sub", true)).length, 1);
  });
});

test("persistent trusted devices store only an encrypted envelope reference and local key handle", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);
    await createKeyEnvelope(context, {
      envelopeId: "env_user-sub_password_1",
      keyId: "ark_user-sub_1",
      sub: "user-sub",
      type: "password",
      wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM",
      wrappedKey: Buffer.from("password-wrapped-ark"),
      aad: Buffer.from("password-aad"),
    });

    await assert.rejects(
      () =>
        createTrustedDevice(context, {
          sub: "user-sub",
          label: "Wrong envelope",
          publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
          keyHandle: "indexeddb:wrong-envelope",
          envelopeId: "env_user-sub_password_1",
        }),
      (error: unknown) => error instanceof ValidationError
    );

    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      label: "MacBook",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      keyHandle: "indexeddb:darkauth:device-key",
      envelopeId: "env_user-sub_device_1",
    });
    const [stored] = await listTrustedDevices(context, "user-sub");
    const [deviceEnvelope] = await listKeyEnvelopes(context, "user-sub", {
      type: "trusted_device",
    });

    assert.equal(stored?.deviceId, device.deviceId);
    assert.equal(stored?.keyHandle, "indexeddb:darkauth:device-key");
    assert.equal(stored?.envelopeId, "env_user-sub_device_1");
    assert.equal(deviceEnvelope?.envelopeId, "env_user-sub_device_1");
    assert.equal(Buffer.from(deviceEnvelope?.wrappedKey || []).toString(), "wrapped-device-key");
    assert.equal("wrappedKey" in (stored as unknown as Record<string, unknown>), false);
    assert.equal("ark" in (stored as unknown as Record<string, unknown>), false);
  });
});

test("device approvals are single-use encrypted transfers", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);
    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      label: "Phone",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      envelopeId: "env_user-sub_device_1",
    });
    const request = await createDeviceApprovalRequest(context, {
      sub: "user-sub",
      requesterSessionId: "session-1",
      newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
      newDeviceLabel: "New laptop",
    });

    assert.equal(request.status, "pending");
    assert.match(request.verificationCode, /^\d{6}$/);
    assert.equal(
      (await listDeviceApprovalRequests(context, "user-sub", { status: "pending" })).length,
      1
    );

    const approved = await approveDeviceApprovalRequest(context, {
      sub: "user-sub",
      requestId: request.requestId,
      approvedByDeviceId: device.deviceId,
      encryptedApproval: Buffer.from("encrypted-ark-to-new-device"),
      approvalAad: approvalAadFor(request),
    });

    assert.equal(approved.status, "approved");
    assert.equal(
      Buffer.from(approved.encryptedApproval || []).toString(),
      "encrypted-ark-to-new-device"
    );

    const consumed = await consumeDeviceApprovalRequest(context, {
      sub: "user-sub",
      requestId: request.requestId,
      newDeviceProof: String(
        (request.metadata as Record<string, unknown>).new_device_public_jwk_hash
      ),
    });

    assert.equal(consumed.status, "consumed");
    await assert.rejects(
      () =>
        consumeDeviceApprovalRequest(context, {
          sub: "user-sub",
          requestId: request.requestId,
          newDeviceProof: String(
            (request.metadata as Record<string, unknown>).new_device_public_jwk_hash
          ),
        }),
      (error: unknown) => error instanceof ConflictError
    );
  });
});

test("revoked devices cannot approve and denied approvals cannot be approved", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);
    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      envelopeId: "env_user-sub_device_1",
    });
    const request = await createDeviceApprovalRequest(context, {
      sub: "user-sub",
      newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
    });

    await revokeTrustedDevice(context, { sub: "user-sub", deviceId: device.deviceId });

    await assert.rejects(
      () =>
        approveDeviceApprovalRequest(context, {
          sub: "user-sub",
          requestId: request.requestId,
          approvedByDeviceId: device.deviceId,
          encryptedApproval: Buffer.from("encrypted"),
          approvalAad: approvalAadFor(request),
        }),
      (error: unknown) => error instanceof ForbiddenError
    );

    const denied = await denyDeviceApprovalRequest(context, {
      sub: "user-sub",
      requestId: request.requestId,
    });

    assert.equal(denied.status, "denied");
  });
});

test("device approval consume verifies proof against requested public key hash", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);
    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      envelopeId: "env_user-sub_device_1",
    });
    const request = await createDeviceApprovalRequest(context, {
      sub: "user-sub",
      newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
    });
    await approveDeviceApprovalRequest(context, {
      sub: "user-sub",
      requestId: request.requestId,
      approvedByDeviceId: device.deviceId,
      encryptedApproval: Buffer.from("encrypted"),
      approvalAad: approvalAadFor(request),
    });

    await assert.rejects(
      () =>
        consumeDeviceApprovalRequest(context, {
          sub: "user-sub",
          requestId: request.requestId,
          newDeviceProof: sha256Base64Url("different-public-key"),
        }),
      (error: unknown) => error instanceof ValidationError
    );
  });
});

test("device approval AAD cannot be replayed across approval requests", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await createTrustedDeviceEnvelope(context);
    const device = await createTrustedDevice(context, {
      sub: "user-sub",
      publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      envelopeId: "env_user-sub_device_1",
    });
    const firstRequest = await createDeviceApprovalRequest(context, {
      sub: "user-sub",
      requesterSessionId: "session-1",
      newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
      metadata: {
        client_id: "client-one",
        state_hash: "state-hash-one",
        verification_code_hash: "code-hash-one",
      },
    });
    const secondRequest = await createDeviceApprovalRequest(context, {
      sub: "user-sub",
      requesterSessionId: "session-2",
      newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
      metadata: {
        client_id: "client-two",
        state_hash: "state-hash-two",
        verification_code_hash: "code-hash-two",
      },
    });

    await assert.rejects(
      () =>
        approveDeviceApprovalRequest(context, {
          sub: "user-sub",
          requestId: secondRequest.requestId,
          approvedByDeviceId: device.deviceId,
          encryptedApproval: Buffer.from("encrypted-for-first-request"),
          approvalAad: approvalAadFor(firstRequest),
        }),
      (error: unknown) => error instanceof ValidationError
    );

    const approved = await approveDeviceApprovalRequest(context, {
      sub: "user-sub",
      requestId: secondRequest.requestId,
      approvedByDeviceId: device.deviceId,
      encryptedApproval: Buffer.from("encrypted-for-second-request"),
      approvalAad: approvalAadFor(secondRequest),
    });

    assert.equal(approved.status, "approved");
    assert.equal(approved.requestId, secondRequest.requestId);
  });
});

test("SCIM policy disables trusted-device approval", async () => {
  await withContext(async (context) => {
    await createUser(context);
    await context.db.insert(scimUsers).values({
      userSub: "user-sub",
      userName: "user-sub@example.com",
      active: true,
    });
    await setSetting(context, "users.scim.allow_trusted_device_approval", false);

    await assert.rejects(
      () =>
        createDeviceApprovalRequest(context, {
          sub: "user-sub",
          newDevicePublicJwk: { kty: "EC", crv: "P-256", x: "nx", y: "ny" },
        }),
      (error: unknown) => error instanceof ForbiddenError
    );
  });
});

function approvalAadFor(request: Awaited<ReturnType<typeof createDeviceApprovalRequest>>) {
  const metadata = request.metadata as Record<string, unknown>;
  return Buffer.from(
    `DarkAuth|device-approval|${request.sub}|${request.requestId}|${metadata.new_device_public_jwk_hash}`
  );
}
