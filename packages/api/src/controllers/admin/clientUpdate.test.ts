import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, mock, test } from "node:test";
import { clients } from "../../db/schema.ts";
import type { Context } from "../../types.ts";
import { updateClientController } from "./clientUpdate.ts";

function createMockResponse() {
  let payload = "";

  return {
    statusCode: 0,
    setHeader: mock.fn(),
    write: mock.fn((chunk: unknown) => {
      if (chunk !== undefined) {
        payload += String(chunk);
      }
      return true;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk !== undefined) {
        payload += String(chunk);
      }
    }),
    get body() {
      return payload;
    },
    get json() {
      if (!payload) return null;
      return JSON.parse(payload);
    },
  } as Partial<ServerResponse>;
}

function createRequest(body: unknown): Partial<IncomingMessage> {
  return {
    method: "PUT",
    url: "/admin/clients/client-a",
    headers: {
      host: "localhost",
      cookie: "__Host-DarkAuth-Admin=session-id",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    body: JSON.stringify(body),
  };
}

function createContext(options?: {
  existingClient?: Record<string, unknown>;
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
              adminRole: "write",
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
            if (table === clients) {
              options?.onPatch?.(patch);
            }
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

async function runUpdateCase(options: {
  existingClient: Record<string, unknown>;
  body: Record<string, unknown>;
}) {
  let patch: Record<string, unknown> | undefined;
  const context = createContext({
    existingClient: options.existingClient,
    onPatch: (nextPatch) => {
      patch = nextPatch;
    },
  });
  const request = createRequest(options.body);
  const response = createMockResponse();

  await updateClientController(
    context,
    request as IncomingMessage,
    response as unknown as ServerResponse,
    "client-a"
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { success: true });
  assert.ok(patch);
  return patch as Record<string, unknown>;
}

describe("admin clientUpdate controller", () => {
  test("icon mode transitions clear conflicting fields", async () => {
    const patch = await runUpdateCase({
      existingClient: {
        type: "confidential",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: Buffer.from("existing-secret"),
      },
      body: {
        dashboardIconMode: "emoji",
        dashboardIconEmoji: "  😀  ",
        dashboardIconLetter: "A",
      },
    });

    assert.equal(patch.dashboardIconMode, "emoji");
    assert.equal(patch.dashboardIconEmoji, "😀");
    assert.equal(patch.dashboardIconLetter, null);
    assert.equal(patch.dashboardIconData, null);
    assert.equal(patch.dashboardIconMimeType, null);
  });

  test("upload null clears icon blob", async () => {
    const patch = await runUpdateCase({
      existingClient: {
        type: "public",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: null,
      },
      body: {
        dashboardIconUpload: null,
      },
    });

    assert.equal(patch.dashboardIconData, null);
    assert.equal(patch.dashboardIconMimeType, null);
  });

  test("normalizes empty appUrl to null", async () => {
    const patch = await runUpdateCase({
      existingClient: {
        type: "public",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: null,
      },
      body: {
        appUrl: "",
      },
    });

    assert.equal(patch.appUrl, null);
  });

  test("handles secret retention, regeneration and clearing based on type/auth", async () => {
    const retainedPatch = await runUpdateCase({
      existingClient: {
        type: "confidential",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: Buffer.from("retained-secret"),
      },
      body: {
        name: "Retain Secret",
      },
    });

    assert.equal(Object.hasOwn(retainedPatch, "clientSecretEnc"), false);

    const regeneratedPatch = await runUpdateCase({
      existingClient: {
        type: "confidential",
        tokenEndpointAuthMethod: "none",
        clientSecretEnc: null,
      },
      body: {
        name: "Regenerate Secret",
      },
    });

    assert.equal(Buffer.isBuffer(regeneratedPatch.clientSecretEnc), true);

    const clearedPatch = await runUpdateCase({
      existingClient: {
        type: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        clientSecretEnc: Buffer.from("old-secret"),
      },
      body: {
        type: "public",
      },
    });

    assert.equal(clearedPatch.tokenEndpointAuthMethod, "none");
    assert.equal(clearedPatch.clientSecretEnc, null);
  });
});
