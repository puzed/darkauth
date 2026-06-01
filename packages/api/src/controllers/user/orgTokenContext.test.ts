import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { decodeJwt } from "jose";
import { createPglite } from "../../db/pglite.ts";
import { clients, organizationMembers, organizations, users } from "../../db/schema.ts";
import { AppError } from "../../errors.ts";
import { createPersonalOrganizationForUser } from "../../models/organizations.ts";
import { userOpaqueRegisterFinish } from "../../models/registration.ts";
import { generateEdDSAKeyPair, storeKeyPair } from "../../services/jwks.ts";
import { createSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { postSessionOrganization } from "./session.ts";
import { postToken } from "./token.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-token-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    config: {
      issuer: "http://localhost:9080",
      publicOrigin: "http://localhost:9080",
      postgresUri: "",
      userPort: 9080,
      adminPort: 9081,
      proxyUi: false,
      kekPassphrase: "test",
      isDevelopment: true,
      rpId: "localhost",
    },
    services: {
      kek: {
        encrypt: async (data: Buffer) => Buffer.from(data),
        decrypt: async (data: Buffer) => Buffer.from(data),
        isAvailable: () => true,
      },
      opaque: {
        finishRegistration: async () => ({
          envelope: new Uint8Array([1, 2, 3]),
          serverPublicKey: new Uint8Array([4, 5, 6]),
        }),
      },
    },
    logger: createLogger(),
    cleanupFunctions: [],
    destroy: async () => {},
  } as unknown as Context;
  const { kid, publicJwk, privateJwk } = await generateEdDSAKeyPair();
  await storeKeyPair(context, kid, publicJwk, privateJwk);
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method?: string;
  url?: string;
  body?: string;
  sessionId?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method || "POST";
  request.url = options.url || "/token";
  request.headers = {
    host: "localhost",
    "user-agent": "node-test",
    cookie: options.sessionId ? `__Host-DarkAuth-User=${options.sessionId}` : "",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  let body = "";
  const headers = new Map<string, string | string[] | number>();
  return {
    statusCode: 0,
    setHeader(name: string, value: string | string[] | number) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
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

async function createPublicRefreshClient(context: Context) {
  await context.db.insert(clients).values({
    clientId: "public-refresh-client",
    name: "Public Refresh",
    type: "public",
    tokenEndpointAuthMethod: "none",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
    grantTypes: ["authorization_code", "refresh_token"],
  });
}

test("issued token after personal organization creation carries org context and personal-org roles", async () => {
  const { context, cleanup } = await createContext();
  try {
    const registered = await userOpaqueRegisterFinish(context, {
      record: new Uint8Array([9, 9, 9]),
      email: "claims-user@example.com",
      name: "Claims User",
    });
    assert.ok(registered.sessionId);

    const personalOrg = await context.db.query.organizations.findFirst({
      where: (table, { eq }) => eq(table.createdByUserSub, registered.sub),
    });
    assert.ok(personalOrg);

    await createPublicRefreshClient(context);
    const issued = await createSession(context, "user", {
      sub: registered.sub,
      clientId: "public-refresh-client",
      scope: "openid profile",
      organizationId: personalOrg?.id,
      organizationSlug: personalOrg?.slug,
    });

    const request = createRequest({
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: issued.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    const response = createResponse();
    await postToken(context, request, response);

    const json = response.json as { access_token: string; id_token: string };
    assert.equal(response.statusCode, 200);
    const claims = decodeJwt(json.access_token) as Record<string, unknown>;
    assert.equal(claims.org_id, personalOrg?.id);
    assert.equal(claims.org_slug, personalOrg?.slug);
    assert.deepEqual((claims.roles as string[]).slice().sort(), ["member", "org_admin"]);
    const idClaims = decodeJwt(json.id_token) as Record<string, unknown>;
    assert.equal(idClaims.org_id, personalOrg?.id);
    assert.deepEqual((idClaims.roles as string[]).slice().sort(), ["member", "org_admin"]);
    assert.ok((idClaims.permissions as string[]).includes("darkauth.org:manage"));
  } finally {
    await cleanup();
  }
});

test("multi-org refresh without session organization requires org context", async () => {
  const { context, cleanup } = await createContext();
  try {
    await context.db.insert(users).values({
      sub: "multi-user",
      email: "multi@example.com",
      name: "Multi Org",
      emailVerifiedAt: new Date(),
    });
    const orgA = await createPersonalOrganizationForUser(context.db, "multi-user", "Multi Org");
    const [orgB] = await context.db
      .insert(organizations)
      .values({ slug: "second-org", name: "Second Org", createdByUserSub: "multi-user" })
      .returning();
    assert.ok(orgB);
    await context.db.insert(organizationMembers).values({
      organizationId: orgB.id,
      userSub: "multi-user",
      status: "active",
    });

    await createPublicRefreshClient(context);

    const noOrgSession = await createSession(context, "user", {
      sub: "multi-user",
      clientId: "public-refresh-client",
      scope: "openid profile",
    });
    const missingRequest = createRequest({
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: noOrgSession.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    await assert.rejects(
      () => postToken(context, missingRequest, createResponse()),
      (error: unknown) => error instanceof AppError && error.code === "ORG_CONTEXT_REQUIRED"
    );

    const staleOrgSession = await createSession(context, "user", {
      sub: "multi-user",
      clientId: "public-refresh-client",
      scope: "openid profile",
      organizationId: "00000000-0000-4000-8000-000000000000",
    });
    const staleRequest = createRequest({
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: staleOrgSession.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    await assert.rejects(
      () => postToken(context, staleRequest, createResponse()),
      (error: unknown) => error instanceof AppError && error.code === "ORG_CONTEXT_REQUIRED"
    );

    const validOrgSession = await createSession(context, "user", {
      sub: "multi-user",
      clientId: "public-refresh-client",
      scope: "openid profile",
      organizationId: orgA.organizationId,
      organizationSlug: orgA.slug,
    });
    const validRequest = createRequest({
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: validOrgSession.refreshToken,
        client_id: "public-refresh-client",
      }).toString(),
    });
    const validResponse = createResponse();
    await postToken(context, validRequest, validResponse);
    const json = validResponse.json as { access_token: string };
    assert.equal(validResponse.statusCode, 200);
    const claims = decodeJwt(json.access_token) as Record<string, unknown>;
    assert.equal(claims.org_id, orgA.organizationId);
    assert.equal(claims.org_slug, orgA.slug);
  } finally {
    await cleanup();
  }
});

test("refresh grant uses organization selected through session organization endpoint", async () => {
  const { context, cleanup } = await createContext();
  try {
    await context.db.insert(users).values({
      sub: "switch-refresh-user",
      email: "switch-refresh@example.com",
      name: "Switch Refresh",
      emailVerifiedAt: new Date(),
    });
    const orgA = await createPersonalOrganizationForUser(
      context.db,
      "switch-refresh-user",
      "Switch Refresh",
      { slug: "switch-refresh-a" }
    );
    const [orgB] = await context.db
      .insert(organizations)
      .values({
        slug: "switch-refresh-b",
        name: "Switch Refresh B",
        createdByUserSub: "switch-refresh-user",
      })
      .returning();
    assert.ok(orgB);
    await context.db.insert(organizationMembers).values({
      organizationId: orgB.id,
      userSub: "switch-refresh-user",
      status: "active",
    });
    await createPublicRefreshClient(context);
    const issued = await createSession(context, "user", {
      sub: "switch-refresh-user",
      clientId: "public-refresh-client",
      scope: "openid profile",
      organizationId: orgA.organizationId,
      organizationSlug: orgA.slug,
    });

    const switchResponse = createResponse();
    await postSessionOrganization(
      context,
      createRequest({
        method: "POST",
        url: "/session/organization",
        sessionId: issued.sessionId,
        body: JSON.stringify({ organization_id: orgB.id }),
      }),
      switchResponse
    );

    assert.equal(switchResponse.statusCode, 200);
    const refreshResponse = createResponse();
    await postToken(
      context,
      createRequest({
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: issued.refreshToken,
          client_id: "public-refresh-client",
        }).toString(),
      }),
      refreshResponse
    );

    const json = refreshResponse.json as { access_token: string; id_token: string };
    assert.equal(refreshResponse.statusCode, 200);
    const accessClaims = decodeJwt(json.access_token) as Record<string, unknown>;
    assert.equal(accessClaims.org_id, orgB.id);
    assert.equal(accessClaims.org_slug, "switch-refresh-b");
    const idClaims = decodeJwt(json.id_token) as Record<string, unknown>;
    assert.equal(idClaims.org_id, orgB.id);
    assert.equal(idClaims.org_slug, "switch-refresh-b");
  } finally {
    await cleanup();
  }
});
