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

function createRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
  } = {}
) {
  return {
    method: options.method || "GET",
    url,
    headers: { host: "localhost", ...options.headers },
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

test("user router exposes page background CSS variables for branded user pages", async () => {
  const values = [
    {
      backgroundColor: "#123456",
      backgroundGradientEnd: "#abcdef",
      brandColor: "#654321",
      primaryBackgroundColor: "#fedcba",
    },
    {
      backgroundColor: "#0a0b0c",
      backgroundGradientEnd: "#101112",
      brandColor: "#c0ffee",
      primaryBackgroundColor: "#decade",
    },
    undefined,
    "",
  ];
  const context = {
    db: {
      query: {
        settings: {
          findFirst: mock.fn(() => Promise.resolve({ value: values.shift() })),
        },
      },
    },
    services: { install: {} },
    logger: createLogger(),
  };

  const router = createUserRouter(context as never);
  const request = createRequest("/branding/custom.css");
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader("content-type"), "text/css; charset=utf-8");
  assert.match(response.body, /:root\{[^}]*--da-page-bg:#123456/);
  assert.match(response.body, /:root\{[^}]*--da-color-page:#123456/);
  assert.match(response.body, /:root\{[^}]*--da-color-brand:#654321/);
  assert.match(response.body, /:root\{[^}]*--da-color-action:#fedcba/);
  assert.match(response.body, /:root\[data-da-theme='light'\]\{[^}]*--da-page-bg:#123456/);
  assert.match(response.body, /:root\[data-da-theme='light'\]\{[^}]*--da-color-page:#123456/);
  assert.match(response.body, /:root\[data-da-theme='dark'\]\{[^}]*--da-page-bg:#0a0b0c/);
  assert.match(response.body, /:root\[data-da-theme='dark'\]\{[^}]*--da-color-page:#0a0b0c/);
  assert.match(
    response.body,
    /:root\[data-da-theme='dark'\]\{[^}]*--da-card-bg:rgba\(255,255,255,0\.05\)/
  );
  assert.match(
    response.body,
    /:root\[data-da-theme='dark'\]\{[^}]*--da-input-bg:rgba\(0,0,0,0\.2\)/
  );
  assert.match(
    response.body,
    /@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-da-theme\]\)\{[^}]*--da-page-bg:#0a0b0c/
  );
  assert.match(response.body, /body\{background:var\(--da-page-bg\)/);
});

test("user router blocks cross-origin session organization updates", async () => {
  const context = {
    logger: createLogger(),
  };

  const router = createUserRouter(context as never);
  const request = createRequest("/session/organization", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      cookie: "__Host-DarkAuth-User=session-id; __Host-DarkAuth-User-Csrf=csrf-token",
      "x-csrf-token": "csrf-token",
    },
  });
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "Cross-site request blocked");
});

test("user router requires CSRF token for session organization updates", async () => {
  const context = {
    logger: createLogger(),
  };

  const router = createUserRouter(context as never);
  const request = createRequest("/session/organization", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      cookie: "__Host-DarkAuth-User=session-id; __Host-DarkAuth-User-Csrf=csrf-token",
    },
  });
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "Missing or invalid CSRF token");
});
