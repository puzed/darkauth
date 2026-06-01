import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { organizationMembers, organizations, sessions, users } from "../../db/schema.ts";
import { getPendingAuth } from "../../models/authorize.ts";
import { createClient } from "../../models/clients.ts";
import type { Context } from "../../types.ts";
import { getAuthorize } from "./authorize.ts";
import { postAuthorizeFinalize } from "./authorizeFinalize.ts";

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

async function createContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-authorize-org-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    logger: createLogger(),
    services: {},
    config: {
      postgresUri: "",
      userPort: 0,
      adminPort: 0,
      proxyUi: false,
      kekPassphrase: "",
      isDevelopment: true,
      publicOrigin: "https://auth.example.com",
      issuer: "https://auth.example.com",
      rpId: "auth.example.com",
    },
    cleanupFunctions: [],
    destroy: async () => {},
  } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method: string;
  url: string;
  sessionId?: string;
  body?: URLSearchParams;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body.toString()] : []) as IncomingMessage;
  request.method = options.method;
  request.url = options.url;
  request.headers = {
    host: "auth.example.com",
    cookie: options.sessionId ? `__Host-DarkAuth-User=${options.sessionId}` : "",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "node-test",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & {
  body: string;
  headers: Record<string, string | string[]>;
  json: unknown;
} {
  let body = "";
  const headers: Record<string, string | string[]> = {};
  return {
    statusCode: 0,
    setHeader(name: string, value: string | string[]) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    write(chunk?: unknown) {
      if (chunk !== undefined)
        body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined)
        body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
    get json() {
      return JSON.parse(body);
    },
  } as ServerResponse & { body: string; headers: Record<string, string | string[]>; json: unknown };
}

async function createUserWithTwoOrganizations(context: Context) {
  const familyOrganizationId = "11111111-1111-4111-8111-111111111111";
  const defaultOrganizationId = "22222222-2222-4222-8222-222222222222";
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "User",
  });
  await context.db.insert(organizations).values([
    {
      id: familyOrganizationId,
      slug: "switch-family",
      name: "Family",
    },
    {
      id: defaultOrganizationId,
      slug: "switch-default",
      name: "Default",
    },
  ]);
  await context.db.insert(organizationMembers).values([
    {
      organizationId: familyOrganizationId,
      userSub: "user-sub",
      status: "active",
    },
    {
      organizationId: defaultOrganizationId,
      userSub: "user-sub",
      status: "active",
    },
  ]);
  await context.db.insert(sessions).values({
    id: "session-id",
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: {
      sub: "user-sub",
      email: "user@example.com",
      otpVerified: true,
      organizationId: familyOrganizationId,
      organizationSlug: "switch-family",
      keyState: "unlocked",
    },
  });
  return { familyOrganizationId, defaultOrganizationId };
}

test("authorize finalization allows switching away from the session organization", async () => {
  const { context, cleanup } = await createContext();
  try {
    const { defaultOrganizationId } = await createUserWithTwoOrganizations(context);
    await createClient(context, {
      clientId: "atlas",
      name: "Atlas",
      type: "confidential",
      requirePkce: false,
      redirectUris: ["https://atlas.example/callback"],
      scopes: ["openid", "profile"],
    });

    const authorizeResponse = createResponse();
    await getAuthorize(
      context,
      createRequest({
        method: "GET",
        url: "/authorize?client_id=atlas&redirect_uri=https%3A%2F%2Fatlas.example%2Fcallback&response_type=code&scope=openid+profile&state=state",
        sessionId: "session-id",
      }),
      authorizeResponse
    );

    assert.equal(authorizeResponse.statusCode, 302);
    const location = authorizeResponse.headers.Location;
    assert.equal(typeof location, "string");
    const requestId = new URL(location as string, "https://auth.example.com").searchParams.get(
      "request_id"
    );
    assert.ok(requestId);

    const pendingRequest = await getPendingAuth(context, requestId);
    assert.ok(pendingRequest);
    assert.equal(pendingRequest.organizationId, null);

    const finalizeResponse = createResponse();
    await postAuthorizeFinalize(
      context,
      createRequest({
        method: "POST",
        url: "/authorize/finalize",
        sessionId: "session-id",
        body: new URLSearchParams({
          request_id: requestId,
          approve: "true",
          organization_id: defaultOrganizationId,
        }),
      }),
      finalizeResponse
    );

    assert.equal(finalizeResponse.statusCode, 200);
    const authCode = await context.db.query.authCodes.findFirst();
    assert.equal(authCode?.organizationId, defaultOrganizationId);
    const session = await context.db.query.sessions.findFirst();
    assert.equal(
      (session?.data as { organizationId?: string }).organizationId,
      defaultOrganizationId
    );
  } finally {
    await cleanup();
  }
});
