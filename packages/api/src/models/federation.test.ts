import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { organizationMembers, organizations, users } from "../db/schema.ts";
import type { Context } from "../types.ts";
import {
  consumeOidcCallbackState,
  createFederationConnection,
  createFederationConnectionDomain,
  createOidcCallbackState,
  discoverOidcMetadata,
  federationDomainRecordName,
  federationDomainRecordValue,
  findFederationConnectionForEmail,
  listFederationConnections,
  mapFederationClaims,
  resolveFederatedUserForClaims,
  runFederationDomainDnsVerification,
  verifyFederationConnectionDomain,
} from "./federation.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-federation-test-"));
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

const publicLookup = async () => [{ address: "203.0.113.10" }];

const metadata = {
  issuer: "https://idp.example.com",
  authorization_endpoint: "https://idp.example.com/oauth/authorize",
  token_endpoint: "https://idp.example.com/oauth/token",
  jwks_uri: "https://idp.example.com/oauth/jwks",
  userinfo_endpoint: "https://idp.example.com/oauth/userinfo",
  response_types_supported: ["code"],
  id_token_signing_alg_values_supported: ["RS256"],
};

test("federation connections support configuration, domain routing, and claim linking", async () => {
  const { context, cleanup } = await createContext();
  try {
    await context.db.insert(users).values({
      sub: "user-sub",
      email: "user@example.com",
      name: "User",
    });

    const connection = await createFederationConnection(context, {
      name: "Example IDP",
      issuer: metadata.issuer,
      clientId: "client-id",
      metadata,
      domains: ["example.com"],
      accountLinkingPolicy: "email_verified",
    });

    const list = await listFederationConnections(context);
    const route = await findFederationConnectionForEmail(context, "user@example.com");
    const claims = mapFederationClaims({
      sub: "external-sub",
      email: "USER@example.com",
      email_verified: true,
      name: "Federated User",
    });
    const resolved = await resolveFederatedUserForClaims(context, connection.id, {
      sub: "external-sub",
      email: "USER@example.com",
      email_verified: true,
      name: "Federated User",
    });
    const resolvedAgain = await resolveFederatedUserForClaims(context, connection.id, {
      sub: "external-sub",
      email: "USER@example.com",
      email_verified: true,
    });

    assert.equal(connection.hasClientSecret, false);
    assert.equal(list.connections.length, 1);
    assert.equal(route?.id, connection.id);
    assert.deepEqual(claims, {
      externalSubject: "external-sub",
      email: "user@example.com",
      emailVerified: true,
      name: "Federated User",
    });
    assert.deepEqual(resolved, {
      userSub: "user-sub",
      identityId: resolved.identityId,
      linked: true,
      created: true,
    });
    assert.deepEqual(resolvedAgain, {
      userSub: "user-sub",
      identityId: resolved.identityId,
      linked: true,
      created: false,
    });
  } finally {
    await cleanup();
  }
});

test("federation configuration rejects email-only account linking", async () => {
  const { context, cleanup } = await createContext();
  try {
    await assert.rejects(
      () =>
        createFederationConnection(context, {
          name: "Example IDP",
          issuer: metadata.issuer,
          clientId: "client-id",
          metadata,
          domains: ["example.com"],
          accountLinkingPolicy: "email",
        }),
      /Invalid account linking policy/
    );
  } finally {
    await cleanup();
  }
});

test("federation routing uses verified domains and organization scope", async () => {
  const { context, cleanup } = await createContext();
  try {
    const [organization] = await context.db
      .insert(organizations)
      .values({
        id: "11111111-1111-4111-8111-111111111111",
        slug: "acme",
        name: "Acme",
      })
      .returning();
    const connection = await createFederationConnection(context, {
      organizationId: organization?.id,
      name: "Acme IDP",
      issuer: metadata.issuer,
      clientId: "acme-client",
      metadata,
    });
    await createFederationConnectionDomain(context, {
      connectionId: connection.id,
      domain: "acme.com",
    });

    const pendingRoute = await findFederationConnectionForEmail(context, "user@acme.com", {
      organizationId: organization?.id,
    });
    await verifyFederationConnectionDomain(context, connection.id, "acme.com");
    const scopedRoute = await findFederationConnectionForEmail(context, "user@acme.com", {
      organizationId: organization?.id,
    });
    const defaultOrganization = await context.db.query.organizations.findFirst({
      where: eq(organizations.slug, "default"),
    });
    const wrongOrgRoute = await findFederationConnectionForEmail(context, "user@acme.com", {
      organizationId: defaultOrganization?.id,
    });

    assert.equal(pendingRoute, null);
    assert.equal(scopedRoute?.id, connection.id);
    assert.equal(wrongOrgRoute, null);
  } finally {
    await cleanup();
  }
});

test("federation JIT creates membership in the connection organization only", async () => {
  const { context, cleanup } = await createContext();
  try {
    const [organization] = await context.db
      .insert(organizations)
      .values({
        id: "22222222-2222-4222-8222-222222222222",
        slug: "jit-acme",
        name: "JIT Acme",
      })
      .returning();
    const connection = await createFederationConnection(context, {
      organizationId: organization?.id,
      name: "JIT Acme IDP",
      issuer: metadata.issuer,
      clientId: "jit-acme-client",
      metadata,
      domains: ["jit-acme.com"],
      accountLinkingPolicy: "disabled",
      jitProvisioning: true,
      membershipOnAuthentication: true,
      requireScimPreProvisioning: false,
    });

    const resolved = await resolveFederatedUserForClaims(context, connection.id, {
      sub: "jit-external-sub",
      email: "new@jit-acme.com",
      email_verified: true,
      name: "New Federated User",
    });
    const membershipRows = await context.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userSub, resolved.userSub || ""));

    assert.equal(resolved.linked, true);
    assert.equal(resolved.created, true);
    assert.equal(membershipRows.length, 1);
    assert.equal(membershipRows[0]?.organizationId, organization?.id);
    assert.equal(membershipRows[0]?.status, "active");
  } finally {
    await cleanup();
  }
});

test("federation DNS TXT verification surfaces a record and verifies on match", async () => {
  const { context, cleanup } = await createContext();
  try {
    const [organization] = await context.db
      .insert(organizations)
      .values({
        id: "33333333-3333-4333-8333-333333333333",
        slug: "dns-acme",
        name: "DNS Acme",
      })
      .returning();
    const connection = await createFederationConnection(context, {
      organizationId: organization?.id,
      name: "DNS Acme IDP",
      issuer: metadata.issuer,
      clientId: "dns-acme-client",
      metadata,
    });
    const created = await createFederationConnectionDomain(context, {
      connectionId: connection.id,
      domain: "dns-acme.com",
    });

    assert.equal(created.verificationStatus, "pending");
    assert.equal(created.recordName, federationDomainRecordName("dns-acme.com"));
    assert.ok(created.verificationToken);
    assert.equal(created.recordValue, federationDomainRecordValue(created.verificationToken || ""));

    const failed = await runFederationDomainDnsVerification(
      context,
      connection.id,
      created.id,
      async () => [["some-other-value"]]
    );
    assert.equal(failed.status, "failed");
    assert.equal(failed.domain.verificationStatus, "failed");
    assert.ok(failed.domain.lastCheckedAt);

    const verified = await runFederationDomainDnsVerification(
      context,
      connection.id,
      created.id,
      async () => [["unrelated"], [federationDomainRecordValue(created.verificationToken || "")]]
    );
    assert.equal(verified.status, "verified");
    assert.equal(verified.domain.verificationStatus, "verified");

    const route = await findFederationConnectionForEmail(context, "user@dns-acme.com", {
      organizationId: organization?.id,
    });
    assert.equal(route?.id, connection.id);
  } finally {
    await cleanup();
  }
});

test("federation OIDC callback state is single use and bound to nonce", async () => {
  const { context, cleanup } = await createContext();
  try {
    const connection = await createFederationConnection(context, {
      name: "Example IDP",
      issuer: metadata.issuer,
      clientId: "client-id",
      metadata,
      domains: ["example.com"],
    });
    const state = await createOidcCallbackState(context, {
      connectionId: connection.id,
      organizationId: connection.organizationId,
      clientId: "user",
      nonce: "nonce",
      codeVerifier: "verifier",
    });

    const consumed = await consumeOidcCallbackState(context, {
      state: state.state,
      nonce: "nonce",
      codeVerifier: "verifier",
    });

    assert.equal(consumed.connectionId, connection.id);
    await assert.rejects(
      () => consumeOidcCallbackState(context, { state: state.state, nonce: "nonce" }),
      /Invalid OIDC state/
    );
  } finally {
    await cleanup();
  }
});

test("OIDC discovery validates issuer, endpoints, and insecure algorithms", async () => {
  await assert.rejects(
    () =>
      discoverOidcMetadata(
        "https://idp.example.com",
        async () =>
          ({
            ok: true,
            json: async () => ({
              ...metadata,
              id_token_signing_alg_values_supported: ["none"],
            }),
          }) as Response,
        publicLookup
      ),
    /must not advertise none/
  );

  const discovered = await discoverOidcMetadata(
    "https://idp.example.com",
    async () =>
      ({
        ok: true,
        json: async () => metadata,
      }) as Response,
    publicLookup
  );

  assert.equal(discovered.issuer, "https://idp.example.com");
});

test("OIDC discovery blocks local and private issuer hosts before fetch", async () => {
  const fetchImpl = mock.fn(async () => ({ ok: true, json: async () => metadata }) as Response);

  await assert.rejects(
    () => discoverOidcMetadata("https://localhost", fetchImpl, publicLookup),
    /issuer host is not allowed/
  );
  await assert.rejects(
    () => discoverOidcMetadata("https://127.0.0.1", fetchImpl, publicLookup),
    /issuer host is not allowed/
  );
  await assert.rejects(
    () => discoverOidcMetadata("https://10.0.0.5", fetchImpl, publicLookup),
    /issuer host is not allowed/
  );
  await assert.rejects(
    () =>
      discoverOidcMetadata("https://idp.internal.example.com", fetchImpl, async () => [
        { address: "192.168.1.8" },
      ]),
    /issuer host is not allowed/
  );

  assert.equal(fetchImpl.mock.callCount(), 0);
});
