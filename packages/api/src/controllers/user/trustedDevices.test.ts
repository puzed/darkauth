import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { clients, sessions, users } from "../../db/schema.ts";
import { createPendingAuth } from "../../models/authorize.ts";
import type { Context } from "../../types.ts";
import { sha256Base64Url } from "../../utils/crypto.ts";
import { postDeviceApprovalRequest } from "./trustedDevices.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-trusted-device-controller-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUserSession(context: Context, sessionId = "session-user-sub") {
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "User",
  });
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub: "user-sub", email: "user@example.com", keyState: "locked" },
  });
  return sessionId;
}

function createRequest(options: { sessionId: string; body: unknown }): IncomingMessage {
  const request = Readable.from([JSON.stringify(options.body)]) as IncomingMessage;
  request.method = "POST";
  request.url = "/crypto/device-approvals";
  request.headers = {
    host: "auth.example.com",
    cookie: `__Host-DarkAuth-User=${encodeURIComponent(options.sessionId)}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  const response = {
    statusCode: 200,
    body: "",
    json: undefined as unknown,
    setHeader() {
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        this.json = JSON.parse(this.body);
      }
      return this;
    },
  };
  return response as ServerResponse & { body: string; json: unknown };
}

test("device approval creation derives OAuth binding from pending authorization", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context);
    await context.db.insert(clients).values({
      clientId: "server-client",
      name: "Server Client",
      type: "public",
      tokenEndpointAuthMethod: "none",
      redirectUris: ["https://client.example/callback"],
    });
    await createPendingAuth(context, {
      requestId: "auth-request",
      clientId: "server-client",
      redirectUri: "https://client.example/callback",
      scope: "openid darkauth:keys",
      state: "server-state",
      userSub: "user-sub",
      origin: "https://client.example",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = createResponse();
    await postDeviceApprovalRequest(
      context,
      createRequest({
        sessionId,
        body: {
          authorization_request_id: "auth-request",
          new_device_public_jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
          client_id: "attacker-client",
          state_hash: "attacker-state",
          verification_code_hash: "code-hash",
        },
      }),
      response
    );

    const body = response.json as {
      approval: { client_id: string; state_hash: string; requester_session_id: string };
    };
    assert.equal(response.statusCode, 201);
    assert.equal(body.approval.client_id, "server-client");
    assert.equal(body.approval.state_hash, sha256Base64Url("server-state"));
    assert.equal(body.approval.requester_session_id, sessionId);
  } finally {
    await cleanup();
  }
});
