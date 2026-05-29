import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { adminUsers, sessions } from "../../db/schema.ts";
import { ForbiddenError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { getFederationConnections, postFederationConnection } from "./federationConnections.ts";

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

function createMockResponse() {
  let payload = "";
  const headers = new Map<string, unknown>();
  return {
    statusCode: 0,
    setHeader: mock.fn((name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
    }),
    getHeader: mock.fn((name: string) => headers.get(name.toLowerCase())),
    write: mock.fn((chunk: unknown) => {
      if (chunk !== undefined) payload += String(chunk);
      return true;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk !== undefined) payload += String(chunk);
    }),
    get json() {
      return payload ? JSON.parse(payload) : null;
    },
  } as Partial<ServerResponse>;
}

function createRequest(method: string, url: string, body?: unknown, sessionId = "admin-session") {
  return {
    method,
    url,
    headers: {
      host: "localhost",
      cookie: `__Host-DarkAuth-Admin=${sessionId}`,
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    body: body === undefined ? "" : JSON.stringify(body),
  } as Partial<IncomingMessage>;
}

async function createTestContext(role: "read" | "write" = "write") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-federation-controller-test-"));
  const { db, close } = await createPglite(directory);
  const adminId = "f1f0f66c-1cc5-4ad2-84ff-90e32f58f8d4";
  await db.insert(adminUsers).values({
    id: adminId,
    email: `${role}@example.com`,
    name: "Admin",
    role,
  });
  await db.insert(sessions).values({
    id: "admin-session",
    cohort: "admin",
    adminId,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    data: { adminId, adminRole: role },
  });
  const context = {
    db,
    logger: createLogger(),
    services: {
      kek: {
        isAvailable: () => true,
        encrypt: async (value: Buffer) => value,
        decrypt: async (value: Buffer) => value,
      },
    },
    config: {
      postgresUri: "postgres://localhost/darkauth",
      userPort: 3000,
      adminPort: 3001,
      proxyUi: false,
      kekPassphrase: "dev",
      isDevelopment: false,
      publicOrigin: "http://localhost:3000",
      issuer: "http://localhost:3000",
      rpId: "localhost",
    },
  } as Context;
  return {
    context,
    cleanup: async () => {
      await close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function metadata() {
  return {
    issuer: "http://localhost:9999",
    authorization_endpoint: "http://localhost:9999/authorize",
    token_endpoint: "http://localhost:9999/token",
    jwks_uri: "http://localhost:9999/jwks",
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
}

test("admin federation create endpoint requires write role", async () => {
  const { context, cleanup } = await createTestContext("read");
  try {
    const request = createRequest("POST", "/admin/federation/connections", {
      name: "Example SSO",
      issuer: "http://localhost:9999",
      clientId: "example-client",
      metadata: metadata(),
    });
    const response = createMockResponse();
    await assert.rejects(
      () =>
        postFederationConnection(
          context,
          request as IncomingMessage,
          response as unknown as ServerResponse
        ),
      ForbiddenError
    );
  } finally {
    await cleanup();
  }
});

test("admin federation endpoints create and list OIDC connections", async () => {
  const { context, cleanup } = await createTestContext("write");
  try {
    const createRequestBody = createRequest("POST", "/admin/federation/connections", {
      name: "Example SSO",
      issuer: "http://localhost:9999",
      clientId: "example-client",
      clientSecret: "secret",
      metadata: metadata(),
      domains: ["example.com"],
    });
    const createResponse = createMockResponse();
    await postFederationConnection(
      context,
      createRequestBody as IncomingMessage,
      createResponse as unknown as ServerResponse
    );

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json.hasClientSecret, true);
    assert.equal(createResponse.json.clientSecretEnc, undefined);

    const listRequest = createRequest("GET", "/admin/federation/connections");
    const listResponse = createMockResponse();
    await getFederationConnections(
      context,
      listRequest as IncomingMessage,
      listResponse as unknown as ServerResponse
    );

    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json.connections.length, 1);
    assert.equal(listResponse.json.connections[0].issuer, "http://localhost:9999");
  } finally {
    await cleanup();
  }
});
