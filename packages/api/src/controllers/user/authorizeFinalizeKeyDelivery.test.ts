import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../../db/pglite.ts";
import { organizationMembers, organizations, scimUsers, sessions, users } from "../../db/schema.ts";
import { createPendingAuth } from "../../models/authorize.ts";
import { createClient } from "../../models/clients.ts";
import { setSetting } from "../../services/settings.ts";
import type { Context } from "../../types.ts";
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-finalize-key-test-"));
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

async function createUserWithSessionAndOrg(context: Context) {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "User",
  });
  await context.db.insert(organizations).values({
    id: organizationId,
    slug: "org",
    name: "Org",
  });
  await context.db.insert(organizationMembers).values({
    organizationId,
    userSub: "user-sub",
    status: "active",
  });
  await context.db.insert(sessions).values({
    id: "session-id",
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: {
      sub: "user-sub",
      email: "user@example.com",
      otpVerified: true,
      keyState: "unlocked",
    },
  });
  await createClient(context, {
    clientId: "client-id",
    name: "Client",
    type: "public",
    redirectUris: ["https://client.example/callback"],
    scopes: ["openid"],
  });
  return organizationId;
}

function createRequest(body: URLSearchParams): IncomingMessage {
  const request = Readable.from([body.toString()]) as IncomingMessage;
  request.method = "POST";
  request.url = "/authorize/finalize";
  request.headers = {
    host: "auth.example.com",
    cookie: "__Host-DarkAuth-User=session-id",
    "content-type": "application/x-www-form-urlencoded",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  const response = {
    statusCode: 200,
    body: "",
    json: undefined as unknown,
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    write(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        this.json = JSON.parse(this.body);
      }
      return this;
    },
  };
  return response as ServerResponse & { body: string; json: unknown };
}

test("authorize finalize stores v2 key hash metadata without legacy drk hash", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organizationId = await createUserWithSessionAndOrg(context);
    await createPendingAuth(context, {
      requestId: "request-v2",
      clientId: "client-id",
      redirectUri: "https://client.example/callback",
      scope: "openid",
      state: "state",
      zkPubKid: "zk-pub-kid",
      keyDeliveryVersion: "v2",
      deliveredKeyKind: "client_app_key",
      origin: "https://auth.example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await postAuthorizeFinalize(
      context,
      createRequest(
        new URLSearchParams({
          request_id: "request-v2",
          approve: "true",
          zk_key_hash: "hash-v2",
          organization_id: organizationId,
        })
      ),
      createResponse()
    );

    const code = await context.db.query.authCodes.findFirst();
    assert.ok(code);
    assert.equal(code.hasZk, true);
    assert.equal(code.zkKeyHash, "hash-v2");
    assert.equal(code.zkKeyKind, "client_app_key");
    assert.equal(code.zkKeyVersion, "v2");
    assert.equal(code.drkHash, null);
  } finally {
    await cleanup();
  }
});

test("authorize finalize rejects ZK delivery when the authenticated session is key locked", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organizationId = await createUserWithSessionAndOrg(context);
    await context.db
      .update(sessions)
      .set({
        data: {
          sub: "user-sub",
          email: "user@example.com",
          otpVerified: true,
          keyState: "locked",
        },
      })
      .where(eq(sessions.id, "session-id"));
    await createPendingAuth(context, {
      requestId: "request-locked",
      clientId: "client-id",
      redirectUri: "https://client.example/callback",
      scope: "openid",
      state: "state",
      zkPubKid: "zk-pub-kid",
      keyDeliveryVersion: "v2",
      deliveredKeyKind: "client_app_key",
      origin: "https://auth.example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await assert.rejects(
      () =>
        postAuthorizeFinalize(
          context,
          createRequest(
            new URLSearchParams({
              request_id: "request-locked",
              approve: "true",
              zk_key_hash: "hash-v2",
              organization_id: organizationId,
            })
          ),
          createResponse()
        ),
      /Key unlock is required/
    );
  } finally {
    await cleanup();
  }
});

test("authorize finalize allows locked SCIM sessions for ZK when policy disables key unlock requirement", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organizationId = await createUserWithSessionAndOrg(context);
    await context.db.insert(scimUsers).values({
      userSub: "user-sub",
      userName: "user@example.com",
      active: true,
    });
    await setSetting(context, "users.scim.require_key_unlock_for_zk", false);
    await context.db
      .update(sessions)
      .set({
        data: {
          sub: "user-sub",
          email: "user@example.com",
          otpVerified: true,
          keyState: "locked",
        },
      })
      .where(eq(sessions.id, "session-id"));
    await createPendingAuth(context, {
      requestId: "request-locked-scim",
      clientId: "client-id",
      redirectUri: "https://client.example/callback",
      scope: "openid",
      state: "state",
      zkPubKid: "zk-pub-kid",
      keyDeliveryVersion: "v2",
      deliveredKeyKind: "client_app_key",
      origin: "https://auth.example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await postAuthorizeFinalize(
      context,
      createRequest(
        new URLSearchParams({
          request_id: "request-locked-scim",
          approve: "true",
          zk_key_hash: "hash-v2",
          organization_id: organizationId,
        })
      ),
      createResponse()
    );

    const code = await context.db.query.authCodes.findFirst();
    assert.equal(code?.zkKeyHash, "hash-v2");
  } finally {
    await cleanup();
  }
});

test("authorize finalize does not store key delivery metadata for non-ZK requests", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organizationId = await createUserWithSessionAndOrg(context);
    await createPendingAuth(context, {
      requestId: "request-non-zk",
      clientId: "client-id",
      redirectUri: "https://client.example/callback",
      scope: "openid",
      state: "state",
      origin: "https://auth.example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await postAuthorizeFinalize(
      context,
      createRequest(
        new URLSearchParams({
          request_id: "request-non-zk",
          approve: "true",
          zk_key_hash: "unexpected-hash",
          drk_hash: "unexpected-drk-hash",
          organization_id: organizationId,
        })
      ),
      createResponse()
    );

    const code = await context.db.query.authCodes.findFirst();
    assert.ok(code);
    assert.equal(code.hasZk, false);
    assert.equal(code.zkPubKid, null);
    assert.equal(code.zkKeyHash, null);
    assert.equal(code.zkKeyKind, null);
    assert.equal(code.zkKeyVersion, null);
    assert.equal(code.drkHash, null);
  } finally {
    await cleanup();
  }
});

test("authorize finalize keeps explicit v1 drk hash binding", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organizationId = await createUserWithSessionAndOrg(context);
    await createPendingAuth(context, {
      requestId: "request-v1",
      clientId: "client-id",
      redirectUri: "https://client.example/callback",
      scope: "openid",
      state: "state",
      zkPubKid: "zk-pub-kid",
      keyDeliveryVersion: "v1-drk",
      deliveredKeyKind: "root_key",
      origin: "https://auth.example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await postAuthorizeFinalize(
      context,
      createRequest(
        new URLSearchParams({
          request_id: "request-v1",
          approve: "true",
          drk_hash: "hash-v1",
          organization_id: organizationId,
        })
      ),
      createResponse()
    );

    const code = await context.db.query.authCodes.findFirst();
    assert.ok(code);
    assert.equal(code.hasZk, true);
    assert.equal(code.drkHash, "hash-v1");
    assert.equal(code.zkKeyHash, "hash-v1");
    assert.equal(code.zkKeyKind, "root_key");
    assert.equal(code.zkKeyVersion, "v1-drk");
  } finally {
    await cleanup();
  }
});
