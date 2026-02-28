import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, mock, test } from "node:test";
import { adminUsers } from "../../db/schema.ts";
import type { Context } from "../../types.ts";
import { postAdminOpaqueLoginFinish } from "./opaqueLoginFinish.ts";

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

function createSelectBuilder(lookup: {
  admin: { id: string; email: string; name: string; role: string } | null;
}) {
  return (selection: unknown) => {
    const keys =
      selection && typeof selection === "object"
        ? Object.keys(selection as Record<string, unknown>)
        : [];
    let table: unknown;

    const resultsByTable = (fromTable: unknown) => {
      if (fromTable === adminUsers && keys.length > 0 && lookup.admin) {
        return [
          {
            id: lookup.admin.id,
            email: lookup.admin.email,
            name: lookup.admin.name,
            role: lookup.admin.role,
            passwordResetRequired: false,
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        ];
      }
      return [];
    };

    const terminal = {
      from(value: unknown) {
        table = value;
        return terminal;
      },
      where() {
        return terminal;
      },
      innerJoin() {
        return terminal;
      },
      leftJoin() {
        return terminal;
      },
      orderBy() {
        return terminal;
      },
      limit: mock.fn(() => resultsByTable(table)),
      offset() {
        return terminal;
      },
    };

    return terminal;
  };
}

describe("Admin OPAQUE Login Finish", () => {
  let context: Context;
  let request: Partial<IncomingMessage>;
  let response: ReturnType<typeof createMockResponse>;
  let finishLogin = mock.fn(async () => ({ sessionKey: new Uint8Array(32) }));

  beforeEach(() => {
    const sessionState: {
      admin: { id: string; email: string; name: string; role: string } | null;
    } = {
      admin: {
        id: "admin-id",
        email: "admin@example.com",
        name: "Admin",
        role: "write",
      },
    };

    context = {
      db: {
        query: {
          opaqueLoginSessions: {
            findFirst: mock.fn(() =>
              Promise.resolve({
                id: "session-id",
                identityU: Buffer.from(sessionState.admin?.email || "admin@example.com").toString(
                  "base64"
                ),
                identityS: Buffer.from("DarkAuth").toString("base64"),
                serverState: Buffer.from("state"),
                expiresAt: new Date("2026-02-25T00:00:00.000Z"),
              })
            ),
          },
          settings: {
            findFirst: mock.fn(() => Promise.resolve(null)),
          },
          otpConfigs: {
            findFirst: mock.fn(() => Promise.resolve(null)),
          },
        },
        select: mock.fn(createSelectBuilder(sessionState)),
        insert: mock.fn(() => ({
          values: mock.fn(() => Promise.resolve()),
        })),
        from: mock.fn(),
        where: mock.fn(),
        update: mock.fn(),
        delete: mock.fn(() => ({ where: mock.fn(() => Promise.resolve()) })),
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
        opaque: {
          finishLogin,
        },
        kek: {
          encrypt: mock.fn(async (value: Buffer) => value),
          decrypt: mock.fn(async (value: Buffer) => value),
          isAvailable: () => true,
        },
      },
      logger: {
        debug: mock.fn(),
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
        trace: mock.fn(),
        fatal: mock.fn(),
      },
      cleanupFunctions: [],
      destroy: async () => {},
    };

    request = {
      method: "POST",
      url: "/admin/opaque/login/finish",
      headers: {},
      socket: {
        remoteAddress: "127.0.0.1",
      },
      body: JSON.stringify({
        sessionId: "session-id",
        finish: "c2Vuc2l0aXZlLWZpbmlzaA",
      }),
    };

    response = createMockResponse();
    finishLogin = mock.fn(async () => ({ sessionKey: new Uint8Array(32) }));
    (context.services.opaque as { finishLogin: typeof finishLogin }).finishLogin = finishLogin;
  });

  test("ignores request body adminId and uses session identity", async () => {
    request.body = JSON.stringify({
      sessionId: "session-id",
      finish: "c2Vuc2l0aXZlLWZpbmlzaA",
      adminId: "attacker-id",
    });

    await postAdminOpaqueLoginFinish(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.admin.email, "admin@example.com");
    assert.equal(response.json.admin.id, "admin-id");
    assert.equal(finishLogin.mock.calls[0]?.arguments?.[1], "session-id");
  });

  test("rejects when session no longer exists", async () => {
    context.db.query.opaqueLoginSessions.findFirst = mock.fn(() => Promise.resolve(null));

    await assert.rejects(
      () =>
        postAdminOpaqueLoginFinish(
          context,
          request as IncomingMessage,
          response as unknown as ServerResponse
        ),
      (error: unknown) => {
        return error instanceof Error && error.message === "Invalid or expired login session";
      }
    );
  });
});
