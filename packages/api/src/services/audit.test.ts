import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import type { Context, ControllerFunction } from "../types.ts";
import { withAudit } from "../utils/auditWrapper.ts";
import {
  countAuditLogs,
  logAuditEvent,
  sanitizeAuditPath,
  sanitizeError,
  sanitizeRequestBody,
} from "./audit.ts";

test("countAuditLogs uses filtered aggregate query and returns numeric count", async () => {
  let whereCalled = false;
  const context = {
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            whereCalled = true;
            return [{ count: "42" }];
          },
        }),
      }),
    },
  } as unknown as Context;

  const total = await countAuditLogs(context, { eventType: "LOGIN_SUCCESS" });

  assert.equal(total, 42);
  assert.equal(whereCalled, true);
});

const secretValues = [
  "pw-secret",
  "old-pw-secret",
  "new-pw-secret",
  "opaque-finish-secret",
  "opaque-message-secret",
  "opaque-record-secret",
  "drk-secret",
  "wrapped-drk-secret",
  "wrapped-private-jwk-secret",
  "drk-jwe-secret",
  "zk-pub-secret",
  "auth-code-secret",
  "pkce-secret",
  "refresh-secret",
  "access-secret",
  "id-secret",
  "client-secret",
  "session-secret",
  "export-key-secret",
  "bearer-secret-token-value",
];

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of secretValues) {
    assert.equal(serialized.includes(secret), false, `${secret} leaked in ${serialized}`);
  }
}

test("sanitizeRequestBody redacts nested JSON secrets with snake_case and camelCase names", () => {
  const sanitized = sanitizeRequestBody({
    email: "user@example.com",
    password: "pw-secret",
    oldPassword: "old-pw-secret",
    new_password: "new-pw-secret",
    opaque: {
      finish: "opaque-finish-secret",
      message: "opaque-message-secret",
      record: "opaque-record-secret",
    },
    keys: [
      {
        drk: "drk-secret",
        wrapped_drk: "wrapped-drk-secret",
        wrappedEncPrivateJwk: "wrapped-private-jwk-secret",
      },
      {
        drk_jwe: "drk-jwe-secret",
        zkPub: "zk-pub-secret",
      },
    ],
    oauth: {
      code: "auth-code-secret",
      codeVerifier: "pkce-secret",
      refresh_token: "refresh-secret",
      accessToken: "access-secret",
      id_token: "id-secret",
      client_secret: "client-secret",
      sessionId: "session-secret",
      export_key: "export-key-secret",
    },
  });

  assertNoSecrets(sanitized);
  assert.equal(sanitized?.email, "user@example.com");
});

test("sanitizeRequestBody parses and redacts form encoded and raw bodies", () => {
  const form = sanitizeRequestBody(
    "client_id=client-1&code=auth-code-secret&code_verifier=pkce-secret&refresh_token=refresh-secret&wrapped_drk=wrapped-drk-secret&safe=value"
  );
  const rawForm = sanitizeRequestBody({
    raw: "access_token=access-secret&id_token=id-secret&client_secret=client-secret&zk_pub=zk-pub-secret&safe=value",
  });
  const rawUnknown = sanitizeRequestBody({
    raw: "not a structured body bearer-secret-token-value",
  });

  assertNoSecrets(form);
  assertNoSecrets(rawForm);
  assertNoSecrets(rawUnknown);
  assert.equal(form?.client_id, "client-1");
  assert.equal(form?.safe, "value");
  assert.equal(rawForm?.safe, "value");
  assert.equal(rawUnknown?.raw, "[REDACTED]");
});

test("sanitizeError redacts bearer, query, JSON and long token material", () => {
  const sanitized = sanitizeError(
    'failed Bearer bearer-secret-token-value at /token?code=auth-code-secret&code_verifier=pkce-secret with {"refresh_token":"refresh-secret"} abcdefghijklmnopqrstuvwxyzABCDEF1234567890'
  );

  assertNoSecrets(sanitized);
  assert.match(sanitized || "", /\[REDACTED\]/);
});

test("sanitizeAuditPath redacts sensitive query and fragment values for runtime logs", () => {
  const sanitized = sanitizeAuditPath(
    "/authorize?client_id=client-1&code=auth-code-secret&zk_pub=zk-pub-secret&safe=value#drk_jwe=drk-jwe-secret"
  );

  assertNoSecrets(sanitized);
  assert.equal(
    sanitized,
    "/authorize?client_id=client-1&code=%5BREDACTED%5D&zk_pub=%5BREDACTED%5D&safe=value#drk_jwe=%5BREDACTED%5D"
  );
});

test("logAuditEvent stores sanitized request bodies, details, changes, errors and paths", async () => {
  let inserted: Record<string, unknown> | undefined;
  const context = {
    db: {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserted = row;
        },
      }),
    },
    logger: { error: () => undefined },
  } as unknown as Context;

  await logAuditEvent(context, {
    eventType: "TOKEN_ISSUED",
    method: "POST",
    path: "/token?code=auth-code-secret&safe=value",
    ipAddress: "127.0.0.1",
    success: false,
    errorMessage: "refresh_token=refresh-secret access_token=access-secret",
    requestBody: {
      raw: "code=auth-code-secret&code_verifier=pkce-secret&refresh_token=refresh-secret&safe=value",
    },
    details: {
      queryParams: {
        code: "auth-code-secret",
        safe: "value",
      },
      referer: "https://rp.example/callback?code=auth-code-secret&access_token=access-secret",
    },
    changes: {
      wrapped_enc_private_jwk: "wrapped-private-jwk-secret",
    },
  });

  assert.ok(inserted);
  assertNoSecrets(inserted);
  assert.equal((inserted?.requestBody as Record<string, unknown>).safe, "value");
  assert.equal(inserted?.path, "/token?code=%5BREDACTED%5D&safe=value");
});

test("logAuditEvent runtime failure logs sanitized errors and events", async () => {
  let logged: unknown;
  const context = {
    db: {
      insert: () => ({
        values: async () => {
          throw new Error("insert failed access_token=access-secret");
        },
      }),
    },
    logger: {
      error: (payload: unknown) => {
        logged = payload;
      },
    },
  } as unknown as Context;

  await logAuditEvent(context, {
    eventType: "TOKEN_ISSUED",
    method: "POST",
    path: "/token?code=auth-code-secret",
    ipAddress: "127.0.0.1",
    success: false,
    resourceId: "session-secret",
    requestBody: { refresh_token: "refresh-secret" },
    details: { referer: "https://rp.example/callback?code=auth-code-secret" },
    errorMessage: "client_secret=client-secret",
  });

  assertNoSecrets(logged);
});

function makeRequest(body: string, contentType: string): IncomingMessage {
  const request = new PassThrough() as IncomingMessage & {
    body?: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress?: string };
  };
  request.body = body;
  request.method = "POST";
  request.url = "/token?code=auth-code-secret&safe=value";
  request.headers = {
    host: "auth.example",
    "content-type": contentType,
    referer: "https://rp.example/callback?code=auth-code-secret&refresh_token=refresh-secret",
    "user-agent": "test-agent",
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function makeResponse(): ServerResponse {
  const response = new PassThrough() as unknown as ServerResponse & {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    write: (chunk?: unknown) => boolean;
    end: (chunk?: unknown) => ServerResponse;
  };
  response.statusCode = 200;
  response.setHeader = () => undefined;
  response.write = () => true;
  response.end = function end() {
    return response;
  };
  return response;
}

test("withAudit sanitizes captured form request bodies and details before insert", async () => {
  let inserted: Record<string, unknown> | undefined;
  const context = {
    db: {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserted = row;
        },
      }),
    },
    logger: { error: () => undefined },
  } as unknown as Context;
  const handler: ControllerFunction = async (_context, _request, response) => {
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true }));
  };
  const wrapped = withAudit({ eventType: "TOKEN_ISSUED", flushAudit: true })(handler);

  await wrapped(
    context,
    makeRequest(
      "client_id=client-1&code=auth-code-secret&code_verifier=pkce-secret&refresh_token=refresh-secret&safe=value",
      "application/x-www-form-urlencoded"
    ),
    makeResponse()
  );

  assert.ok(inserted);
  assertNoSecrets(inserted);
  assert.equal((inserted?.requestBody as Record<string, unknown>).client_id, "client-1");
  assert.equal((inserted?.requestBody as Record<string, unknown>).safe, "value");
});
