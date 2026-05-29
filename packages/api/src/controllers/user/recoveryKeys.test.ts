import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../../db/pglite.ts";
import { auditLogs, recoveryKeys, sessions, users } from "../../db/schema.ts";
import { createAccountKey } from "../../models/keybag.ts";
import type { Context } from "../../types.ts";
import { toBase64Url } from "../../utils/crypto.ts";
import { getRecoveryKeys, postRecoveryKey, postRecoveryKeyUse } from "./recoveryKeys.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-recovery-controller-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUserSession(context: Context, sub: string, sessionId = `session-${sub}`) {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
  await createAccountKey(context, { keyId: `ark_${sub}_1`, sub });
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: sub,
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub, email: `${sub}@example.com`, otpVerified: true },
  });
  return sessionId;
}

function createRequest(options: {
  method?: string;
  url?: string;
  sessionId?: string;
  body?: unknown;
}): IncomingMessage {
  const rawBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const request = Readable.from(rawBody ? [rawBody] : []) as IncomingMessage;
  request.method = options.method ?? "GET";
  request.url = options.url ?? "/";
  request.headers = {
    host: "auth.example.com",
    ...(options.sessionId
      ? { cookie: `__Host-DarkAuth-User=${encodeURIComponent(options.sessionId)}` }
      : {}),
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & {
  body: string;
  headers: Record<string, string | number | string[]>;
  json: unknown;
} {
  const response = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string | number | string[]>,
    json: undefined as unknown,
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        this.json = JSON.parse(this.body);
      }
      return this;
    },
    write(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      return true;
    },
  };
  return response as ServerResponse & {
    body: string;
    headers: Record<string, string | number | string[]>;
    json: unknown;
  };
}

function verifier() {
  return Buffer.from("0123456789abcdef0123456789abcdef");
}

function canonicalEnvelopeAad(data: {
  sub: string;
  keyId: string;
  envelopeId: string;
  type: string;
  wrappingAlg: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      envelope_id: data.envelopeId,
      key_id: data.keyId,
      sub: data.sub,
      type: data.type,
      wrapping_alg: data.wrappingAlg,
    })
  );
}

test("recovery key endpoints create hash-only records and never return plaintext verifier", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    const aad = canonicalEnvelopeAad({
      sub: "user-a",
      keyId: "ark_user-a_1",
      envelopeId: "env_user-a_recovery_1",
      type: "recovery",
      wrappingAlg: "HKDF-SHA256+A256GCM/v2",
    });

    const createResponseBody = createResponse();
    await postRecoveryKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/recovery-keys",
        sessionId,
        body: {
          recovery_key_id: "rk_user-a_1",
          envelope_id: "env_user-a_recovery_1",
          key_id: "ark_user-a_1",
          label: "Paper key",
          wrapping_alg: "HKDF-SHA256+A256GCM/v2",
          wrapped_key: toBase64Url(Buffer.from("wrapped-recovery-envelope")),
          aad: toBase64Url(aad),
          verifier: toBase64Url(verifier()),
          metadata: { version: "v2" },
        },
      }),
      createResponseBody
    );

    assert.equal(createResponseBody.statusCode, 201);
    assert.equal(JSON.stringify(createResponseBody.json).includes(toBase64Url(verifier())), false);
    assert.equal(
      JSON.stringify(createResponseBody.json).includes(verifier().toString("utf8")),
      false
    );
    assert.equal(
      (createResponseBody.json as { recovery_key: { envelope: { wrapped_key: string } } })
        .recovery_key.envelope.wrapped_key,
      toBase64Url(Buffer.from("wrapped-recovery-envelope"))
    );
    const stored = await context.db.query.recoveryKeys.findFirst({
      where: eq(recoveryKeys.recoveryKeyId, "rk_user-a_1"),
    });
    assert.ok(stored?.verifierHash.startsWith("$argon2"));
    assert.notEqual(stored?.verifierHash, toBase64Url(verifier()));

    const listResponse = createResponse();
    await getRecoveryKeys(
      context,
      createRequest({ method: "GET", url: "/crypto/recovery-keys", sessionId }),
      listResponse
    );
    assert.equal(JSON.stringify(listResponse.json).includes("verifierHash"), false);
    assert.equal(JSON.stringify(listResponse.json).includes(toBase64Url(verifier())), false);
    assert.equal(JSON.stringify(listResponse.json).includes(verifier().toString("utf8")), false);
    assert.equal((listResponse.json as { recovery_keys: unknown[] }).recovery_keys.length, 1);
  } finally {
    await cleanup();
  }
});

test("recording recovery key use updates usage and writes an audit event", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    const aad = canonicalEnvelopeAad({
      sub: "user-a",
      keyId: "ark_user-a_1",
      envelopeId: "env_user-a_recovery_1",
      type: "recovery",
      wrappingAlg: "HKDF-SHA256+A256GCM/v2",
    });
    await postRecoveryKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/recovery-keys",
        sessionId,
        body: {
          recovery_key_id: "rk_user-a_1",
          envelope_id: "env_user-a_recovery_1",
          key_id: "ark_user-a_1",
          wrapping_alg: "HKDF-SHA256+A256GCM/v2",
          wrapped_key: toBase64Url(Buffer.from("wrapped-recovery-envelope")),
          aad: toBase64Url(aad),
          verifier: toBase64Url(verifier()),
        },
      }),
      createResponse()
    );

    const useResponse = createResponse();
    await postRecoveryKeyUse(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/recovery-keys/rk_user-a_1/use",
        sessionId,
        body: { verifier: toBase64Url(verifier()) },
      }),
      useResponse,
      "rk_user-a_1"
    );

    assert.equal(useResponse.statusCode, 200);
    assert.ok(
      (useResponse.json as { recovery_key: { last_used_at: string | null } }).recovery_key
        .last_used_at
    );
    const audit = await context.db.query.auditLogs.findFirst({
      where: eq(auditLogs.eventType, "RECOVERY_KEY_USE"),
    });
    assert.equal(audit?.userId, "user-a");
    assert.equal(audit?.resourceId, "rk_user-a_1");
    assert.equal(audit?.success, true);
    assert.equal(JSON.stringify(audit).includes(toBase64Url(verifier())), false);
  } finally {
    await cleanup();
  }
});
