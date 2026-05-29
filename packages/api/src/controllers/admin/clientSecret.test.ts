import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, mock, test } from "node:test";
import { clients } from "../../db/schema.ts";
import { ForbiddenError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { getClientSecretController, rotateClientSecretController } from "./clientSecret.ts";

function createMockResponse() {
  let payload = "";

  return {
    statusCode: 0,
    setHeader: mock.fn(),
    write: mock.fn((chunk: unknown) => {
      if (chunk !== undefined) payload += String(chunk);
      return true;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk !== undefined) payload += String(chunk);
    }),
    get json() {
      if (!payload) return null;
      return JSON.parse(payload);
    },
  } as Partial<ServerResponse>;
}

function createRequest(method: string): Partial<IncomingMessage> {
  return {
    method,
    url: "/admin/clients/client-a/secret",
    headers: {
      host: "localhost",
      cookie: "__Host-DarkAuth-Admin=session-id",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };
}

function createContext(options?: {
  adminRole?: "read" | "write";
  existingClient?: Record<string, unknown> | null;
  onPatch?: (patch: Record<string, unknown>) => void;
}): Context {
  return {
    db: {
      query: {
        sessions: {
          findFirst: mock.fn(async () => ({
            id: "session-id",
            cohort: "admin",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            data: {
              adminId: "f1f0f66c-1cc5-4ad2-84ff-90e32f58f8d4",
              adminRole: options?.adminRole ?? "write",
            },
          })),
        },
        clients: {
          findFirst: mock.fn(async () => options?.existingClient ?? null),
        },
      },
      insert: mock.fn(() => ({
        values: mock.fn(async () => {}),
      })),
      update: mock.fn((table: unknown) => ({
        set: mock.fn((patch: Record<string, unknown>) => ({
          where: mock.fn(async () => {
            if (table === clients) options?.onPatch?.(patch);
          }),
        })),
      })),
      delete: mock.fn(() => ({ where: mock.fn(async () => {}) })),
      select: mock.fn(),
      from: mock.fn(),
      where: mock.fn(),
      transaction: mock.fn(),
    } as unknown as Context["db"],
    config: {
      postgresUri: "postgres://localhost/darkauth",
      userPort: 3000,
      adminPort: 3001,
      proxyUi: false,
      kekPassphrase: "dev",
      isDevelopment: false,
      publicOrigin: "http://localhost:3000",
      issuer: "darkauth",
      rpId: "darkauth",
    },
    services: {
      kek: {
        isAvailable: () => true,
        encrypt: mock.fn(async (value: Buffer) => Buffer.from(`enc:${value.toString("base64")}`)),
        decrypt: mock.fn(async (value: Buffer) => value),
      },
    },
    logger: {
      debug: mock.fn(),
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      trace: mock.fn(),
      fatal: mock.fn(),
    },
    cleanupFunctions: [],
    destroy: async () => {},
  } as Context;
}

describe("admin client secret controller", () => {
  test("does not reveal a stored client secret on read", async () => {
    const context = createContext({
      adminRole: "read",
      existingClient: {
        clientId: "client-a",
        type: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        clientSecretEnc: Buffer.from("existing-secret"),
      },
    });
    const response = createMockResponse();

    await getClientSecretController(
      context,
      createRequest("GET") as IncomingMessage,
      response as unknown as ServerResponse,
      "client-a"
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { clientId: "client-a", clientSecret: null });
  });

  test("rejects secret rotation for read-only admins", async () => {
    const context = createContext({
      adminRole: "read",
      existingClient: {
        clientId: "client-a",
        type: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        clientSecretEnc: Buffer.from("existing-secret"),
      },
    });

    await assert.rejects(
      () =>
        rotateClientSecretController(
          context,
          createRequest("POST") as IncomingMessage,
          createMockResponse() as unknown as ServerResponse,
          "client-a"
        ),
      (error: unknown) =>
        error instanceof ForbiddenError && error.message === "Write access required"
    );
  });

  test("rotates and returns a new client secret for write admins", async () => {
    let patch: Record<string, unknown> | undefined;
    const context = createContext({
      existingClient: {
        clientId: "client-a",
        type: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        clientSecretEnc: Buffer.from("existing-secret"),
      },
      onPatch: (nextPatch) => {
        patch = nextPatch;
      },
    });
    const response = createMockResponse();

    await rotateClientSecretController(
      context,
      createRequest("POST") as IncomingMessage,
      response as unknown as ServerResponse,
      "client-a"
    );

    assert.equal(response.statusCode, 200);
    assert.equal(typeof response.json.clientSecret, "string");
    assert.equal(response.json.clientSecret.length > 20, true);
    const encrypted = patch?.clientSecretEnc;
    assert.equal(Buffer.isBuffer(encrypted), true);
    assert.notEqual((encrypted as Buffer).toString(), "existing-secret");
  });
});
