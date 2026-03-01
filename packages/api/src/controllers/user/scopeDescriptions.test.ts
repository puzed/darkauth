import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { NotFoundError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { getScopeDescriptions } from "./scopeDescriptions.ts";

function createRequest(url: string): IncomingMessage {
  return {
    url,
    headers: { host: "localhost:3000" },
  } as IncomingMessage;
}

function createResponse(): ServerResponse & { body: string; headers: Record<string, string> } {
  let body = "";
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
  } as ServerResponse & { body: string; headers: Record<string, string> };
}

function createContext(client: { scopes: unknown } | null): Context {
  return {
    db: {
      query: {
        clients: {
          findFirst: async () => client,
        },
      },
    },
  } as unknown as Context;
}

test("getScopeDescriptions rejects unknown client", async () => {
  const context = createContext(null);
  const request = createRequest("/scope-descriptions?client_id=missing-client&scopes=openid");
  const response = createResponse();

  await assert.rejects(
    () => getScopeDescriptions(context, request, response),
    (error: unknown) => error instanceof NotFoundError && error.message === "Unknown client"
  );
});

test("getScopeDescriptions returns empty descriptions when scopes are omitted", async () => {
  const context = createContext({
    scopes: [
      JSON.stringify({ key: "openid", description: "Authenticate you" }),
      JSON.stringify({ key: "profile", description: "Access your profile" }),
    ],
  });
  const request = createRequest("/scope-descriptions?client_id=demo-public-client");
  const response = createResponse();

  await getScopeDescriptions(context, request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(response.body), { descriptions: {} });
});

test("getScopeDescriptions returns only requested scopes that have descriptions", async () => {
  const context = createContext({
    scopes: [
      "openid",
      JSON.stringify({ key: "profile", description: "Access your profile" }),
      JSON.stringify({ key: "email", description: "Read your email address" }),
    ],
  });
  const request = createRequest(
    "/scope-descriptions?client_id=demo-public-client&scopes=openid%20email%20unknown"
  );
  const response = createResponse();

  await getScopeDescriptions(context, request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    descriptions: {
      email: "Read your email address",
    },
  });
});
