import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, mock, test } from "node:test";
import { ExpiredInstallTokenError, ForbiddenInstallTokenError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { postInstallOpaqueRegisterFinish } from "./opaqueRegisterFinish.ts";
import { postInstallOpaqueRegisterStart } from "./opaqueRegisterStart.ts";
import { postInstallComplete } from "./postInstallComplete.ts";

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

function createRequest(url: string, body: unknown): Partial<IncomingMessage> {
  const rawBody = JSON.stringify(body);
  return {
    method: "POST",
    url,
    headers: {
      host: "localhost",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    body: rawBody,
    rawBody,
  } as Partial<IncomingMessage> & { body: string; rawBody: string };
}

function createLogger() {
  return {
    debug: mock.fn(),
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn(),
    trace: mock.fn(),
    fatal: mock.fn(),
  };
}

function createInsertChain() {
  return {
    values: mock.fn(() => ({
      onConflictDoUpdate: mock.fn(async () => {}),
      onConflictDoNothing: mock.fn(async () => {}),
      returning: mock.fn(async () => [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "admin@example.com",
        },
      ]),
    })),
  };
}

function createDb() {
  const trx = {
    query: {
      adminUsers: {
        findFirst: mock.fn(async () => null),
      },
      adminOpaqueRecords: {
        findFirst: mock.fn(async () => null),
      },
    },
    insert: mock.fn(() => createInsertChain()),
  };

  return {
    query: {
      settings: {
        findFirst: mock.fn(async () => undefined),
      },
      adminUsers: {
        findFirst: mock.fn(async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          email: "admin@example.com",
        })),
        findMany: mock.fn(async () => [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "admin@example.com",
          },
        ]),
      },
      adminOpaqueRecords: {
        findFirst: mock.fn(async () => ({
          adminId: "11111111-1111-4111-8111-111111111111",
        })),
      },
      organizations: {
        findFirst: mock.fn(async () => null),
      },
      roles: {
        findFirst: mock.fn(async () => null),
      },
    },
    insert: mock.fn(() => createInsertChain()),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(async () => {}),
      })),
    })),
    delete: mock.fn(() => ({
      where: mock.fn(async () => {}),
    })),
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        where: mock.fn(async () => []),
      })),
    })),
    transaction: mock.fn(async (callback: (trx: unknown) => Promise<unknown>) => callback(trx)),
    execute: mock.fn(async () => {}),
  } as unknown as Context["db"];
}

function createContext(overrides?: Partial<Context>): Context {
  const db = createDb();

  return {
    db,
    config: {
      postgresUri: "postgres://localhost/darkauth",
      userPort: 3000,
      adminPort: 3001,
      proxyUi: false,
      kekPassphrase: "test-passphrase",
      isDevelopment: false,
      publicOrigin: "http://localhost:3000",
      issuer: "http://localhost:3000",
      rpId: "localhost",
      inInstallMode: true,
      configFile: path.join(
        os.tmpdir(),
        `darkauth-install-test-${Date.now()}-${Math.random()}.yaml`
      ),
    },
    services: {
      kek: {
        isAvailable: () => true,
        encrypt: mock.fn(async (value: Buffer) => value),
        decrypt: mock.fn(async (value: Buffer) => value),
      },
      opaque: {
        serverSetup: mock.fn(async () => ({ serverPublicKey: "server-public-key" })),
        startRegistration: mock.fn(async () => ({
          message: Buffer.from("start-message"),
          serverPublicKey: Buffer.from("server-public-key"),
        })),
        finishRegistration: mock.fn(async () => ({
          envelope: Buffer.from("envelope"),
          serverPublicKey: Buffer.from("server-public-key"),
        })),
        startLogin: mock.fn(),
        startLoginWithDummy: mock.fn(),
        finishLogin: mock.fn(),
      },
      install: {
        token: "install-token",
        createdAt: Date.now(),
      },
    },
    logger: createLogger(),
    cleanupFunctions: [],
    destroy: async () => {},
    restart: mock.fn(async () => {}),
    ...overrides,
  } as Context;
}

function opaqueStartBody(token = "install-token") {
  return {
    token,
    email: "admin@example.com",
    name: "Admin",
    request: Buffer.from("opaque-start").toString("base64url"),
  };
}

function opaqueFinishBody(token = "install-token") {
  return {
    token,
    email: "admin@example.com",
    name: "Admin",
    record: Buffer.from("opaque-record").toString("base64url"),
  };
}

function installCompleteBody(token = "install-token") {
  return {
    token,
    adminEmail: "admin@example.com",
    adminName: "Admin",
    selfRegistrationEnabled: false,
  };
}

describe("install bootstrap token handling", () => {
  test("does not refresh an expired token during OPAQUE registration start", async () => {
    const createdAt = Date.now() - 11 * 60 * 1000;
    const context = createContext({
      services: {
        install: {
          token: "install-token",
          createdAt,
        },
      },
    } as Partial<Context>);
    const request = createRequest("/install/opaque/start", opaqueStartBody());
    const response = createMockResponse();

    await postInstallOpaqueRegisterStart(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 403);
    assert.equal(context.services.install?.createdAt, createdAt);
    assert.equal(response.json?.code, "EXPIRED_INSTALL_TOKEN");
  });

  test("accepts a fresh token during OPAQUE registration start", async () => {
    const context = createContext();
    context.services.install = {
      token: "install-token",
      createdAt: Date.now(),
      tempDb: context.db,
    };
    const request = createRequest("/install/opaque/start", opaqueStartBody());
    const response = createMockResponse();

    await postInstallOpaqueRegisterStart(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 200);
    assert.equal(context.services.install?.adminEmail, "admin@example.com");
    assert.equal(typeof response.json?.message, "string");
  });

  test("keeps the install token after OPAQUE registration finish", async () => {
    const context = createContext();
    const request = createRequest("/install/opaque/finish", opaqueFinishBody());
    const response = createMockResponse();

    await postInstallOpaqueRegisterFinish(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 201);
    assert.equal(context.services.install?.adminCreated, true);
    assert.equal(context.services.install?.token, "install-token");
  });

  test("rejects install completion with admin already created and an invalid token", async () => {
    const context = createContext();
    context.services.install = {
      token: "install-token",
      createdAt: Date.now(),
      adminCreated: true,
    };
    const request = createRequest("/install", installCompleteBody("wrong-token"));
    const response = createMockResponse();

    await assert.rejects(
      () =>
        postInstallComplete(
          context,
          request as IncomingMessage,
          response as unknown as ServerResponse
        ),
      (error: unknown) => error instanceof ForbiddenInstallTokenError
    );
  });

  test("rejects install completion with admin already created and an expired token", async () => {
    const context = createContext();
    context.services.install = {
      token: "install-token",
      createdAt: Date.now() - 11 * 60 * 1000,
      adminCreated: true,
    };
    const request = createRequest("/install", installCompleteBody());
    const response = createMockResponse();

    await assert.rejects(
      () =>
        postInstallComplete(
          context,
          request as IncomingMessage,
          response as unknown as ServerResponse
        ),
      (error: unknown) => error instanceof ExpiredInstallTokenError
    );
  });

  test("accepts install completion with admin already created and a fresh token", async () => {
    const context = createContext();
    context.services.install = {
      token: "install-token",
      createdAt: Date.now(),
      adminCreated: true,
      tempDb: context.db,
    };
    const request = createRequest("/install", installCompleteBody());
    const response = createMockResponse();

    await postInstallComplete(
      context,
      request as IncomingMessage,
      response as unknown as ServerResponse
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.json?.success, true);
    assert.equal(context.services.install?.token, undefined);
    assert.equal(context.services.install?.createdAt, undefined);
  });
});
