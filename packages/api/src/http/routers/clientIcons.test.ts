import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mock, test } from "node:test";
import { createAdminRouter } from "./adminRouter.js";
import { createUserRouter } from "./userRouter.js";

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

function createContext(
  icon: {
    dashboardIconMode: "letter" | "emoji" | "upload";
    dashboardIconData: Buffer | null;
    dashboardIconMimeType: string | null;
  } | null
) {
  return {
    db: {
      query: {
        clients: {
          findFirst: mock.fn(() => Promise.resolve(icon)),
        },
      },
    },
    logger: createLogger(),
  };
}

function createRequest(url: string) {
  return {
    method: "GET",
    url,
    headers: { host: "localhost" },
    socket: { remoteAddress: "127.0.0.1" },
  } as Partial<IncomingMessage>;
}

test("user router serves uploaded client icon", async () => {
  const context = createContext({
    dashboardIconMode: "upload",
    dashboardIconData: Buffer.from("icon-data"),
    dashboardIconMimeType: "image/png",
  });
  const router = createUserRouter(context as never);
  const request = createRequest("/client-icons/app-1");
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader("content-type"), "image/png");
  assert.equal(response.getHeader("cache-control"), "public, max-age=86400");
  assert.equal(response.body, "icon-data");
});

test("admin router serves uploaded client icon without admin session token", async () => {
  const context = createContext({
    dashboardIconMode: "upload",
    dashboardIconData: Buffer.from("admin-icon"),
    dashboardIconMimeType: "image/webp",
  });
  const router = createAdminRouter(context as never);
  const request = createRequest("/client-icons/app-2");
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader("content-type"), "image/webp");
  assert.equal(response.body, "admin-icon");
});

test("user router returns 404 when icon is not upload mode", async () => {
  const context = createContext({
    dashboardIconMode: "letter",
    dashboardIconData: null,
    dashboardIconMimeType: null,
  });
  const router = createUserRouter(context as never);
  const request = createRequest("/client-icons/app-3");
  const response = createMockResponse();

  await router(request as IncomingMessage, response as ServerResponse);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json, {
    error: "Icon not found",
    code: "NOT_FOUND",
  });
});
