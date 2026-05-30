import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { sessions, users } from "../../db/schema.ts";
import type { Context } from "../../types.ts";
import { toBase64Url } from "../../utils/crypto.ts";
import {
  deleteKeyEnvelope,
  getKeybag,
  getKeyEnvelopes,
  postAccountKey,
  postKeyEnvelope,
  postRotateAccountKey,
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-keybag-controller-test-"));
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

test("keybag endpoints create, list, and revoke account key envelopes for the session user", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    const wrappedKey = toBase64Url(Buffer.from("wrapped-key"));
    const aad = toBase64Url(
      canonicalEnvelopeAad({
        sub: "user-a",
        keyId: "ark_user-a_1",
        envelopeId: "env_user-a_password_1",
        type: "password",
        wrappingAlg: "OPAQUE-HKDF-SHA256+A256GCM",
      })
    );

    const accountKeyResponse = createResponse();
    await postAccountKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/account-key",
        sessionId,
        body: { key_id: "ark_user-a_1" },
      }),
      accountKeyResponse
    );

    assert.equal(accountKeyResponse.statusCode, 201);
    assert.deepEqual(accountKeyResponse.json, {
      account_key: {
        key_id: "ark_user-a_1",
        sub: "user-a",
        version: "v2",
        status: "active",
        created_at: (accountKeyResponse.json as { account_key: { created_at: string } }).account_key
          .created_at,
        rotated_at: null,
      },
    });

    const envelopeResponse = createResponse();
    await postKeyEnvelope(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/envelopes",
        sessionId,
        body: {
          envelope_id: "env_user-a_password_1",
          key_id: "ark_user-a_1",
          type: "password",
          label: "Password",
          wrapping_alg: "OPAQUE-HKDF-SHA256+A256GCM",
          wrapped_key: wrappedKey,
          aad,
          metadata: { version: "v2" },
        },
      }),
      envelopeResponse
    );

    assert.equal(envelopeResponse.statusCode, 201);
    assert.equal(
      (envelopeResponse.json as { envelope: { wrapped_key: string } }).envelope.wrapped_key,
      wrappedKey
    );
    assert.equal((envelopeResponse.json as { envelope: { sub: string } }).envelope.sub, "user-a");
    assert.equal(
      (envelopeResponse.json as { envelope: Record<string, unknown> }).envelope.plaintext_key,
      undefined
    );

    const keybagResponse = createResponse();
    await getKeybag(
      context,
      createRequest({ method: "GET", url: "/crypto/keybag", sessionId }),
      keybagResponse
    );
    const keybag = keybagResponse.json as {
      account_keys: unknown[];
      envelopes: { envelope_id: string }[];
    };
    assert.equal(keybag.account_keys.length, 1);
    assert.equal(keybag.envelopes.length, 1);
    assert.equal(keybag.envelopes[0]?.envelope_id, "env_user-a_password_1");

    const deleteResponse = createResponse();
    await deleteKeyEnvelope(
      context,
      createRequest({
        method: "DELETE",
        url: "/crypto/keybag/envelopes/env_user-a_password_1",
        sessionId,
      }),
      deleteResponse,
      "env_user-a_password_1"
    );
    assert.equal(deleteResponse.statusCode, 200);

    const activeEnvelopesResponse = createResponse();
    await getKeyEnvelopes(
      context,
      createRequest({ method: "GET", url: "/crypto/keybag/envelopes", sessionId }),
      activeEnvelopesResponse
    );
    assert.deepEqual(activeEnvelopesResponse.json, { envelopes: [] });

    const allEnvelopesResponse = createResponse();
    await getKeyEnvelopes(
      context,
      createRequest({
        method: "GET",
        url: "/crypto/keybag/envelopes?include_revoked=true",
        sessionId,
      }),
      allEnvelopesResponse
    );
    assert.equal((allEnvelopesResponse.json as { envelopes: unknown[] }).envelopes.length, 1);
  } finally {
    await cleanup();
  }
});

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

test("keybag endpoints isolate users by session subject", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionA = await createUserSession(context, "user-a");
    const sessionB = await createUserSession(context, "user-b");

    await postAccountKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/account-key",
        sessionId: sessionA,
        body: { key_id: "ark_user-a_1" },
      }),
      createResponse()
    );

    await assert.rejects(
      () =>
        postKeyEnvelope(
          context,
          createRequest({
            method: "POST",
            url: "/crypto/keybag/envelopes",
            sessionId: sessionB,
            body: {
              envelope_id: "env_cross_user",
              key_id: "ark_user-a_1",
              type: "password",
              wrapping_alg: "OPAQUE-HKDF-SHA256+A256GCM",
              wrapped_key: toBase64Url(Buffer.from("wrapped-key")),
              aad: toBase64Url(Buffer.from("aad")),
            },
          }),
          createResponse()
        ),
      /Envelope subject mismatch/
    );

    const response = createResponse();
    await getKeybag(
      context,
      createRequest({ method: "GET", url: "/crypto/keybag", sessionId: sessionB }),
      response
    );
    assert.deepEqual(response.json, { account_keys: [], envelopes: [] });
  } finally {
    await cleanup();
  }
});

test("keybag endpoints reject malformed ciphertext encoding", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    await postAccountKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/account-key",
        sessionId,
        body: { key_id: "ark_user-a_1" },
      }),
      createResponse()
    );

    await assert.rejects(
      () =>
        postKeyEnvelope(
          context,
          createRequest({
            method: "POST",
            url: "/crypto/keybag/envelopes",
            sessionId,
            body: {
              key_id: "ark_user-a_1",
              type: "password",
              wrapping_alg: "OPAQUE-HKDF-SHA256+A256GCM",
              wrapped_key: "not+base64url",
              aad: toBase64Url(Buffer.from("aad")),
            },
          }),
          createResponse()
        ),
      /Invalid request format/
    );
  } finally {
    await cleanup();
  }
});

test("keybag rotate endpoint creates a new active account key and retires old envelopes on request", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    await postAccountKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/account-key",
        sessionId,
        body: { key_id: "ark_user-a_1" },
      }),
      createResponse()
    );
    await postKeyEnvelope(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/envelopes",
        sessionId,
        body: {
          envelope_id: "env_user-a_password_1",
          key_id: "ark_user-a_1",
          type: "password",
          wrapping_alg: "OPAQUE-HKDF-SHA256+A256GCM",
          wrapped_key: toBase64Url(Buffer.from("wrapped-key")),
          aad: toBase64Url(Buffer.from("aad")),
        },
      }),
      createResponse()
    );

    const rotateResponse = createResponse();
    await postRotateAccountKey(
      context,
      createRequest({
        method: "POST",
        url: "/crypto/keybag/rotate",
        sessionId,
        body: { key_id: "ark_user-a_2", retire_old_envelopes: true },
      }),
      rotateResponse
    );

    assert.equal(rotateResponse.statusCode, 201);
    assert.equal(
      (rotateResponse.json as { account_key: { key_id: string } }).account_key.key_id,
      "ark_user-a_2"
    );
    assert.equal(
      (rotateResponse.json as { previous_account_keys: Array<{ key_id: string }> })
        .previous_account_keys[0]?.key_id,
      "ark_user-a_1"
    );
    assert.equal(
      (rotateResponse.json as { retired_envelope_count: number }).retired_envelope_count,
      1
    );
  } finally {
    await cleanup();
  }
});
