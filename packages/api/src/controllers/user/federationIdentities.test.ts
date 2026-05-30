import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { federationIdentities, sessions, users } from "../../db/schema.ts";
import { createFederationConnection } from "../../models/federation.ts";
import type { Context } from "../../types.ts";
import { getFederationIdentities } from "./federationIdentities.ts";

const metadata = {
  issuer: "https://idp.example.com",
  authorization_endpoint: "https://idp.example.com/oauth/authorize",
  token_endpoint: "https://idp.example.com/oauth/token",
  jwks_uri: "https://idp.example.com/.well-known/jwks.json",
};

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-fed-identities-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUserSession(context: Context) {
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "User",
  });
  await context.db.insert(sessions).values({
    id: "session-id",
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub: "user-sub", email: "user@example.com", otpVerified: true },
  });
}

function createRequest(): IncomingMessage {
  const request = Readable.from([]) as IncomingMessage;
  request.method = "GET";
  request.url = "/federation/identities";
  request.headers = {
    host: "auth.example.com",
    cookie: "__Host-DarkAuth-User=session-id",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  let body = "";
  return {
    statusCode: 0,
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get json() {
      return body ? JSON.parse(body) : undefined;
    },
  } as ServerResponse & { body: string; json: unknown };
}

test("connected federation identities list only the signed-in user's links", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUserSession(context);
    await context.db.insert(users).values({
      sub: "other-sub",
      email: "other@example.com",
      name: "Other",
    });
    const connection = await createFederationConnection(context, {
      name: "Example IDP",
      issuer: metadata.issuer,
      clientId: "client-id",
      metadata,
      domains: ["example.com"],
    });
    await context.db.insert(federationIdentities).values([
      {
        connectionId: connection.id,
        userSub: "user-sub",
        issuer: metadata.issuer,
        externalSubject: "external-user",
        email: "user@example.com",
        emailVerified: true,
      },
      {
        connectionId: connection.id,
        userSub: "other-sub",
        issuer: metadata.issuer,
        externalSubject: "external-other",
        email: "other@example.com",
        emailVerified: true,
      },
    ]);
    const response = createResponse();

    await getFederationIdentities(context, createRequest(), response);

    const json = response.json as { identities: Array<Record<string, unknown>> };
    assert.equal(response.statusCode, 200);
    assert.equal(json.identities.length, 1);
    assert.equal(json.identities[0]?.connection_name, "Example IDP");
    assert.equal(json.identities[0]?.external_subject, "external-user");
    assert.equal(json.identities[0]?.email_verified, true);
  } finally {
    await cleanup();
  }
});
