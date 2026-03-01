import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, mock, test } from "node:test";
import { organizationMembers, roles } from "../../db/schema.ts";
import type { Context } from "../../types.ts";
import { postOpaqueLoginFinish } from "./opaqueLoginFinish.ts";

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

function createSelectBuilder(state: {
  organizations: Array<{
    organizationId: string;
    status: string;
    slug: string;
  }>;
  roleRows: Array<{ roleKey: string }>;
}) {
  return (selection: unknown) => {
    const keys =
      selection && typeof selection === "object"
        ? Object.keys(selection as Record<string, unknown>)
        : [];
    let table: unknown;

    const rows = (fromTable: unknown) => {
      if (fromTable === organizationMembers) {
        if (keys.includes("organizationId")) {
          return state.organizations;
        }
        if (keys.includes("roleKey")) {
          return state.roleRows;
        }
      }
      if (fromTable === roles) {
        return [];
      }
      return [];
    };

    const rowsAsResult = (fromTable: unknown) => {
      const result = rows(fromTable);
      return Object.assign([], result, {
        limit: mock.fn((size?: number) => result.slice(0, size ?? result.length)),
      });
    };

    const terminal = {
      from(value: unknown) {
        table = value;
        return terminal;
      },
      innerJoin() {
        return terminal;
      },
      leftJoin() {
        return terminal;
      },
      where() {
        return rowsAsResult(table);
      },
      limit: mock.fn((size?: number) => {
        const result = rows(table);
        return result.slice(0, size ?? result.length);
      }),
      orderBy() {
        return terminal;
      },
      offset() {
        return terminal;
      },
    };

    return terminal;
  };
}

describe("User OPAQUE Login Finish", () => {
  let context: Context;
  let request: Partial<IncomingMessage>;
  let response: ReturnType<typeof createMockResponse>;
  let finishLogin = mock.fn(async () => ({ sessionKey: new Uint8Array(32) }));

  beforeEach(() => {
    const userState = {
      user: {
        sub: "user-123",
        email: "server@example.com",
        name: "User",
      },
      organizations: [
        {
          organizationId: "org-1",
          status: "active",
          slug: "default",
        },
      ],
      roleRows: [],
    };

    context = {
      db: {
        query: {
          opaqueLoginSessions: {
            findFirst: mock.fn(() =>
              Promise.resolve({
                id: "session-id",
                identityU: Buffer.from(userState.user.email).toString("base64"),
                identityS: Buffer.from("DarkAuth").toString("base64"),
                serverState: Buffer.from("state"),
                expiresAt: new Date("2026-02-25T00:00:00.000Z"),
              })
            ),
          },
          users: {
            findFirst: mock.fn(() => Promise.resolve(userState.user)),
          },
          settings: {
            findFirst: mock.fn(() => Promise.resolve(null)),
          },
        },
        select: mock.fn(createSelectBuilder(userState)),
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
      url: "/opaque/login/finish",
      headers: {},
      socket: {
        remoteAddress: "127.0.0.1",
      },
      body: JSON.stringify({
        sessionId: "session-id",
        finish: "c2Vuc2l0aXZlLWZpbmlzaA",
        email: "attacker@example.com",
      }),
    };

    response = createMockResponse();
    finishLogin = mock.fn(async () => ({ sessionKey: new Uint8Array(32) }));
    (context.services.opaque as { finishLogin: typeof finishLogin }).finishLogin = finishLogin;
  });

  test("uses server-bound email over request body", async () => {
    await postOpaqueLoginFinish(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.user.email, "server@example.com");
    assert.equal(response.json.user.sub, "user-123");
    assert.equal(response.json.adminRequired, undefined);
    assert.equal(finishLogin.mock.calls[0]?.arguments?.[1], "session-id");
  });

  test("decodes encrypted identity when KEK available", async () => {
    const kekService = context.services.kek;
    if (!kekService) {
      throw new Error("KEK service not configured");
    }

    kekService.decrypt = mock.fn(async (_value: Buffer) => Buffer.from("server@example.com"));
    context.db.query.opaqueLoginSessions.findFirst = mock.fn(() =>
      Promise.resolve({
        id: "session-id",
        identityU: Buffer.from("encrypted").toString("base64"),
        identityS: Buffer.from("DarkAuth").toString("base64"),
        serverState: Buffer.from("state"),
        expiresAt: new Date("2026-02-25T00:00:00.000Z"),
      })
    );

    await postOpaqueLoginFinish(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 200);
    assert.equal(context.services.kek?.decrypt?.mock.calls.length, 1);
    const encryptedArg = context.services.kek?.decrypt?.mock.calls[0]?.arguments?.[0] as
      | Buffer
      | undefined;
    assert.equal(Buffer.isBuffer(encryptedArg), true);
  });

  test("rejects missing session", async () => {
    context.db.query.opaqueLoginSessions.findFirst = mock.fn(() => Promise.resolve(null));

    await assert.rejects(
      () =>
        postOpaqueLoginFinish(
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
