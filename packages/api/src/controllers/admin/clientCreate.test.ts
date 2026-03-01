import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, mock, test } from "node:test";
import { clients } from "../../db/schema.ts";
import { ForbiddenError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { createClient } from "./clientCreate.ts";

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
    method: "POST",
    url: "/admin/clients",
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
  adminRole?: "read" | "write";
  onInsertClient?: (row: Record<string, unknown>) => void;
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
      },
      insert: mock.fn((table: unknown) => ({
        values: mock.fn(async (row: Record<string, unknown>) => {
          if (table === clients) {
            options?.onInsertClient?.(row);
          }
        }),
      })),
      update: mock.fn(),
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
        encrypt: mock.fn(async (value: Buffer) => value),
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

describe("admin clientCreate controller", () => {
  test("rejects read-only admin session", async () => {
    const context = createContext({ adminRole: "read" });
    const request = createRequest({
      clientId: "client-a",
      name: "Client A",
      type: "public",
    });
    const response = createMockResponse();

    await assert.rejects(
      () =>
        createClient(context, request as IncomingMessage, response as unknown as ServerResponse),
      (error: unknown) =>
        error instanceof ForbiddenError && error.message === "Write access required"
    );
  });

  test("applies defaults and scope serialization behavior", async () => {
    let inserted: Record<string, unknown> | undefined;
    const context = createContext({
      onInsertClient: (row) => {
        inserted = row;
      },
    });
    const request = createRequest({
      clientId: "client-defaults",
      name: "Defaults Client",
      type: "public",
      scopes: [
        "openid",
        { key: "profile", description: " Access profile information " },
        " email ",
        "openid",
      ],
    });
    const response = createMockResponse();

    await createClient(context, request as IncomingMessage, response as unknown as ServerResponse);

    assert.equal(response.statusCode, 201);
    assert.ok(inserted);
    assert.deepEqual(inserted?.scopes, [
      "openid",
      JSON.stringify({ key: "profile", description: "Access profile information" }),
      "email",
    ]);

    const json = response.json as Record<string, unknown>;
    assert.equal(json.tokenEndpointAuthMethod, "none");
    assert.equal(json.showOnUserDashboard, false);
    assert.equal(json.dashboardPosition, 0);
    assert.equal(json.appUrl, null);
    assert.equal(json.dashboardIconMode, "letter");
    assert.equal(json.requirePkce, true);
    assert.deepEqual(json.allowedJweAlgs, []);
    assert.deepEqual(json.allowedJweEncs, []);
    assert.deepEqual(json.redirectUris, []);
    assert.deepEqual(json.postLogoutRedirectUris, []);
    assert.deepEqual(json.grantTypes, ["authorization_code"]);
    assert.deepEqual(json.responseTypes, ["code"]);
    assert.deepEqual(json.scopes, [
      { key: "openid" },
      { key: "profile", description: "Access profile information" },
      { key: "email" },
    ]);
  });

  test("maps dashboardIconUpload base64 into expected fields", async () => {
    let inserted: Record<string, unknown> | undefined;
    const context = createContext({
      onInsertClient: (row) => {
        inserted = row;
      },
    });
    const iconBytes = Buffer.from("icon-binary", "utf-8");
    const request = createRequest({
      clientId: "client-upload",
      name: "Upload Client",
      type: "public",
      dashboardIconMode: "upload",
      dashboardIconUpload: {
        mimeType: "image/png",
        data: iconBytes.toString("base64"),
      },
    });
    const response = createMockResponse();

    await createClient(context, request as IncomingMessage, response as unknown as ServerResponse);

    assert.equal(response.statusCode, 201);
    assert.equal(inserted?.dashboardIconMode, "upload");
    assert.equal(inserted?.dashboardIconMimeType, "image/png");
    assert.deepEqual(inserted?.dashboardIconData, iconBytes);
    assert.equal(inserted?.dashboardIconEmoji, null);
    assert.equal(inserted?.dashboardIconLetter, null);
  });
});
