import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mock, test } from "node:test";
import { createUserRouter } from "./userRouter.ts";

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
  const headers = new Map<string, string>();

  return {
    statusCode: 0,
    setHeader: mock.fn((key: string, value: string) => {
      headers.set(key.toLowerCase(), value);
    }),
    write: mock.fn((chunk: unknown) => {
      if (chunk !== undefined) {
        payload += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
      }
      return true;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk !== undefined) {
        payload += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
      }
    }),
    get body() {
      return payload;
    },
    get json() {
      if (!payload) return null;
      return JSON.parse(payload);
    },
    getHeader(key: string) {
      return headers.get(key.toLowerCase());
    },
  } as Partial<ServerResponse>;
}

function createRequest(url: string) {
  return {
    method: "GET",
    url,
    headers: { host: "localhost" },
    socket: { remoteAddress: "127.0.0.1" },
  } as Partial<IncomingMessage>;
}

test("user router wires GET /scope-descriptions to return parsed scope descriptions", async () => {
  const context = {
    db: {
      query: {
        clients: {
          findFirst: mock.fn(() =>
            Promise.resolve({
              scopes: [
                '{"key":"openid","description":"Authenticate you"}',
                '{"key":"profile","description":"Access your profile information"}',
                "email",
              ],
            })
          ),
        },
      },
    },
    logger: createLogger(),
  };

  const router = createUserRouter(context as never);
  const request = createRequest(
    "/scope-descriptions?client_id=demo-public-client&scopes=openid%20profile%20email"
  );
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader("content-type"), "application/json");
  assert.deepEqual(response.json, {
    descriptions: {
      openid: "Authenticate you",
      profile: "Access your profile information",
    },
  });
});

test("user router wires GET /scope-descriptions validation failures", async () => {
  const context = {
    db: {
      query: {
        clients: {
          findFirst: mock.fn(() => Promise.resolve(null)),
        },
      },
    },
    logger: createLogger(),
  };

  const router = createUserRouter(context as never);
  const request = createRequest("/scope-descriptions?scopes=openid");
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json, {
    error: "invalid_request",
    error_description: "Invalid input: expected string, received undefined",
  });
});
