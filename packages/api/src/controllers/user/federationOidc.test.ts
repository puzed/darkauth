import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createPglite } from "../../db/pglite.ts";
import {
  federationIdentities,
  organizationMembers,
  organizations,
  sessions,
  users,
} from "../../db/schema.ts";
import { UnauthorizedError } from "../../errors.ts";
import { createFederationConnection } from "../../models/federation.ts";
import type { Context } from "../../types.ts";
import { getFederationCallback, getFederationStart } from "./federationOidc.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-federation-oidc-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    logger: createLogger(),
    services: {
      kek: {
        isAvailable: () => true,
        encrypt: async (value: Buffer) => value,
        decrypt: async (value: Buffer) => value,
      },
    },
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

function metadata() {
  return {
    issuer: "https://idp.example.com",
    authorization_endpoint: "https://idp.example.com/oauth/authorize",
    token_endpoint: "https://idp.example.com/oauth/token",
    jwks_uri: "https://idp.example.com/oauth/jwks",
    userinfo_endpoint: "https://idp.example.com/oauth/userinfo",
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
}

function createRequest(url: string, cookie?: string) {
  return {
    method: "GET",
    url,
    headers: {
      host: "auth.example.com",
      ...(cookie ? { cookie } : {}),
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
  } as Partial<IncomingMessage> as IncomingMessage;
}

function createResponse() {
  const headers = new Map<string, unknown>();
  return {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end() {},
    get location() {
      return headers.get("location") as string | undefined;
    },
    get cookies() {
      const value = headers.get("set-cookie");
      return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    },
  } as Partial<ServerResponse> & { location?: string; cookies: string[] };
}

async function createUserWithOrganization(context: Context, sub = "user-sub") {
  await context.db.insert(users).values({
    sub,
    email: "user@example.com",
    name: "Existing User",
  });
  let organization = await context.db.query.organizations.findFirst({
    where: eq(organizations.slug, "default"),
  });
  if (!organization) {
    [organization] = await context.db
      .insert(organizations)
      .values({ slug: "default", name: "Default" })
      .returning();
  }
  await context.db.insert(organizationMembers).values({
    organizationId: organization?.id as string,
    userSub: sub,
    status: "active",
  });
}

async function createConnection(
  context: Context,
  accountLinkingPolicy: "disabled" | "email_verified" | "email" = "email_verified",
  enabled = true
) {
  return await createFederationConnection(context, {
    name: "Example IDP",
    issuer: metadata().issuer,
    clientId: "darkauth-client",
    clientSecret: "client-secret",
    metadata: metadata(),
    domains: ["example.com"],
    accountLinkingPolicy,
    enabled,
  });
}

async function startFederation(context: Context, connectionId: string) {
  const startRequest = createRequest(
    `/federation/start?connection_id=${encodeURIComponent(connectionId)}&return_to=%2Fafter`
  );
  const startResponse = createResponse();
  await getFederationStart(context, startRequest, startResponse as unknown as ServerResponse);
  const startUrl = new URL(startResponse.location as string);
  const callbackCookie = startResponse.cookies[0]?.split(";")[0] as string;
  const cookieValue = JSON.parse(decodeURIComponent(callbackCookie.split("=")[1] as string));
  return {
    state: startUrl.searchParams.get("state") as string,
    nonce: cookieValue.nonce as string,
    codeVerifier: cookieValue.codeVerifier as string,
    cookie: callbackCookie,
    location: startUrl,
  };
}

async function signingKeyPair() {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  return { ...pair, publicJwk };
}

async function signedIdToken(options: {
  privateKey: CryptoKey;
  nonce: string;
  issuer?: string;
  subject?: string;
  audience?: string;
  emailVerified?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    sub: options.subject ?? "external-sub",
    email: "user@example.com",
    email_verified: options.emailVerified ?? true,
    name: "Federated User",
    nonce: options.nonce,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? metadata().issuer)
    .setAudience(options.audience ?? "darkauth-client")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(options.privateKey);
}

function mockOidcFetch(options: {
  publicJwk: Record<string, unknown>;
  idToken: string;
  expectCodeVerifier?: string;
}) {
  return mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === metadata().token_endpoint) {
        const body = init?.body as URLSearchParams;
        if (options.expectCodeVerifier) {
          assert.equal(body.get("code_verifier"), options.expectCodeVerifier);
        }
        assert.equal(body.get("client_secret"), "client-secret");
        return new Response(
          JSON.stringify({
            id_token: options.idToken,
            access_token: "upstream-access-token",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url === metadata().jwks_uri) {
        return new Response(JSON.stringify({ keys: [options.publicJwk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === metadata().userinfo_endpoint) {
        return new Response(
          JSON.stringify({
            sub: "external-sub",
            email: "user@example.com",
            email_verified: true,
            name: "Userinfo User",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    }
  );
}

test("federation start redirects to upstream OIDC with PKCE state and nonce", async () => {
  const { context, cleanup } = await createContext();
  try {
    const connection = await createConnection(context);
    const started = await startFederation(context, connection.id);

    assert.equal(started.location.origin, "https://idp.example.com");
    assert.equal(started.location.pathname, "/oauth/authorize");
    assert.equal(started.location.searchParams.get("response_type"), "code");
    assert.equal(started.location.searchParams.get("client_id"), "darkauth-client");
    assert.equal(
      started.location.searchParams.get("redirect_uri"),
      "https://auth.example.com/api/user/federation/oidc/callback"
    );
    assert.equal(started.location.searchParams.get("code_challenge_method"), "S256");
    assert.ok(started.location.searchParams.get("code_challenge"));
    assert.ok(started.state);
    assert.ok(started.nonce);
  } finally {
    await cleanup();
  }
});

test("federation callback validates ID token, links account, and creates locked session", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUserWithOrganization(context);
    const connection = await createConnection(context);
    const started = await startFederation(context, connection.id);
    const keyPair = await signingKeyPair();
    const idToken = await signedIdToken({
      privateKey: keyPair.privateKey,
      nonce: started.nonce,
    });
    const activeFetchMock = mockOidcFetch({
      publicJwk: keyPair.publicJwk,
      idToken,
      expectCodeVerifier: started.codeVerifier,
    });
    const callbackRequest = createRequest(
      `/federation/callback?state=${encodeURIComponent(started.state)}&code=auth-code`,
      started.cookie
    );
    const callbackResponse = createResponse();

    await getFederationCallback(
      context,
      callbackRequest,
      callbackResponse as unknown as ServerResponse
    );

    assert.equal(callbackResponse.statusCode, 302);
    assert.equal(callbackResponse.location, "/after");
    const sessionRows = await context.db.select().from(sessions);
    assert.equal(sessionRows.length, 1);
    assert.equal((sessionRows[0]?.data as { keyState?: string }).keyState, "locked");
    const identities = await context.db.select().from(federationIdentities);
    assert.equal(identities.length, 1);
    assert.equal(identities[0]?.externalSubject, "external-sub");
    activeFetchMock.mock.restore();
  } finally {
    await cleanup();
  }
});

test("federation callback rejects bad nonce, bad issuer, and bad signature", async () => {
  for (const variant of ["nonce", "issuer", "signature"] as const) {
    const { context, cleanup } = await createContext();
    try {
      await createUserWithOrganization(context);
      const connection = await createConnection(context);
      const started = await startFederation(context, connection.id);
      const goodKeyPair = await signingKeyPair();
      const badKeyPair = await signingKeyPair();
      const idToken = await signedIdToken({
        privateKey: variant === "signature" ? badKeyPair.privateKey : goodKeyPair.privateKey,
        nonce: variant === "nonce" ? "bad-nonce" : started.nonce,
        issuer: variant === "issuer" ? "https://wrong.example.com" : undefined,
      });
      const fetchMock = mockOidcFetch({
        publicJwk: goodKeyPair.publicJwk,
        idToken,
      });
      const callbackRequest = createRequest(
        `/federation/callback?state=${encodeURIComponent(started.state)}&code=auth-code`,
        started.cookie
      );
      const callbackResponse = createResponse();

      await assert.rejects(
        () =>
          getFederationCallback(
            context,
            callbackRequest,
            callbackResponse as unknown as ServerResponse
          ),
        UnauthorizedError
      );
      fetchMock.mock.restore();
    } finally {
      await cleanup();
    }
  }
});

test("federation start rejects disabled connections", async () => {
  const { context, cleanup } = await createContext();
  try {
    const connection = await createConnection(context, "email_verified", false);
    await assert.rejects(
      () => startFederation(context, connection.id),
      /Federation connection is disabled/
    );
  } finally {
    await cleanup();
  }
});

test("federation callback rejects account-link policy failure", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUserWithOrganization(context);
    const connection = await createConnection(context, "disabled", true);
    const started = await startFederation(context, connection.id);
    const keyPair = await signingKeyPair();
    const idToken = await signedIdToken({
      privateKey: keyPair.privateKey,
      nonce: started.nonce,
    });
    const fetchMock = mockOidcFetch({ publicJwk: keyPair.publicJwk, idToken });
    const callbackRequest = createRequest(
      `/federation/callback?state=${encodeURIComponent(started.state)}&code=auth-code`,
      started.cookie
    );
    const callbackResponse = createResponse();

    await assert.rejects(
      () =>
        getFederationCallback(
          context,
          callbackRequest,
          callbackResponse as unknown as ServerResponse
        ),
      /Federation account is not linked/
    );
    fetchMock.mock.restore();
  } finally {
    await cleanup();
  }
});

test("federation callback rejects unverified email linking without explicit gate", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUserWithOrganization(context);
    const connection = await createConnection(context, "email", true);
    const started = await startFederation(context, connection.id);
    const keyPair = await signingKeyPair();
    const idToken = await signedIdToken({
      privateKey: keyPair.privateKey,
      nonce: started.nonce,
      emailVerified: false,
    });
    const fetchMock = mockOidcFetch({ publicJwk: keyPair.publicJwk, idToken });
    const callbackRequest = createRequest(
      `/federation/callback?state=${encodeURIComponent(started.state)}&code=auth-code`,
      started.cookie
    );
    const callbackResponse = createResponse();

    await assert.rejects(
      () =>
        getFederationCallback(
          context,
          callbackRequest,
          callbackResponse as unknown as ServerResponse
        ),
      /Federation account is not linked/
    );
    fetchMock.mock.restore();
  } finally {
    await cleanup();
  }
});
