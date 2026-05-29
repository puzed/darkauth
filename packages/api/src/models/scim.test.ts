import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { authCodes, pendingAuth, scimGroupMembers, scimUsers, sessions } from "../db/schema.ts";
import { UnauthorizedError } from "../errors.ts";
import { createSession } from "../services/sessions.ts";
import type { Context } from "../types.ts";
import { createAuthCode, getAuthCode } from "./authCodes.ts";
import { createPendingAuth } from "./authorize.ts";
import { createClient } from "./clients.ts";
import {
  createScimBearerToken,
  createScimGroup,
  createScimUser,
  deactivateScimUser,
  getScimUser,
  listScimUsers,
  patchScimGroup,
  patchScimUser,
  requireScimBearerToken,
  revokeScimBearerToken,
} from "./scim.ts";

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

async function withContext(run: (context: Context) => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-scim-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  try {
    await run(context);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("SCIM bearer tokens are hashed, accepted, and revoked", async () => {
  await withContext(async (context) => {
    const created = await createScimBearerToken(context, { name: "Directory Sync" });

    assert.ok(created.id);
    assert.ok(created.token.startsWith("da_scim_"));
    assert.notEqual(created.tokenPrefix, created.token);

    const auth = await requireScimBearerToken(context, created.token);
    assert.equal(auth.id, created.id);

    await assert.rejects(
      () => requireScimBearerToken(context, "da_scim_wrong"),
      (error: unknown) => error instanceof UnauthorizedError
    );

    await revokeScimBearerToken(context, created.id);

    await assert.rejects(
      () => requireScimBearerToken(context, created.token),
      (error: unknown) => error instanceof UnauthorizedError
    );
  });
});

test("SCIM users support create, get, list, filter, patch, and deactivation revocation", async () => {
  await withContext(async (context) => {
    const user = await createScimUser(context, {
      externalId: "external-1",
      userName: "ada@example.com",
      name: { formatted: "Ada Lovelace" },
      active: true,
    });

    assert.equal(user.externalId, "external-1");
    assert.equal(user.userName, "ada@example.com");
    assert.equal(user.active, true);

    const fetched = await getScimUser(context, user.id);
    assert.equal(fetched.id, user.id);

    const listed = await listScimUsers(context, {
      filter: 'externalId eq "external-1"',
      startIndex: 1,
      count: 10,
    });
    assert.equal(listed.totalResults, 1);
    assert.equal(listed.Resources[0]?.id, user.id);

    const patched = await patchScimUser(context, user.id, [
      { op: "replace", path: "displayName", value: "Countess Lovelace" },
      { op: "replace", path: "active", value: false },
    ]);
    assert.equal(patched.displayName, "Countess Lovelace");
    assert.equal(patched.active, false);

    await context.db.insert(sessions).values({
      id: "session-1",
      cohort: "user",
      userSub: user.id,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      data: { sub: user.id },
      refreshToken: "refresh-hash",
      refreshTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    await deactivateScimUser(context, user.id);

    const remaining = await context.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userSub, user.id));
    assert.equal(remaining.length, 0);

    await assert.rejects(
      () => createSession(context, "user", { sub: user.id }),
      (error: unknown) => error instanceof UnauthorizedError
    );
  });
});

test("SCIM deactivation invalidates outstanding auth codes and pending auth for that user", async () => {
  await withContext(async (context) => {
    await createClient(context, {
      clientId: "client-id",
      name: "Client",
      type: "public",
      redirectUris: ["https://client.example/callback"],
    });
    const deprovisioned = await createScimUser(context, {
      userName: "deprovisioned@example.com",
      displayName: "Deprovisioned User",
    });
    const active = await createScimUser(context, {
      userName: "active@example.com",
      displayName: "Active User",
    });

    await createAuthCode(context, {
      code: "deprovisioned-code",
      clientId: "client-id",
      userSub: deprovisioned.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createAuthCode(context, {
      code: "active-code",
      clientId: "client-id",
      userSub: active.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createPendingAuth(context, {
      requestId: "deprovisioned-request",
      clientId: "client-id",
      userSub: deprovisioned.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      origin: "https://auth.example.com",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createPendingAuth(context, {
      requestId: "active-request",
      clientId: "client-id",
      userSub: active.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      origin: "https://auth.example.com",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    await deactivateScimUser(context, deprovisioned.id);

    assert.equal(await getAuthCode(context, "deprovisioned-code"), null);
    assert.equal((await getAuthCode(context, "active-code"))?.code, "active-code");

    const remainingAuthCodes = await context.db
      .select({ code: authCodes.code })
      .from(authCodes)
      .orderBy(authCodes.code);
    assert.deepEqual(
      remainingAuthCodes.map((row) => row.code),
      ["active-code"]
    );

    const remainingPendingAuth = await context.db
      .select({ requestId: pendingAuth.requestId })
      .from(pendingAuth)
      .orderBy(pendingAuth.requestId);
    assert.deepEqual(
      remainingPendingAuth.map((row) => row.requestId),
      ["active-request"]
    );
  });
});

test("inactive SCIM auth codes are not returned for token redemption defense", async () => {
  await withContext(async (context) => {
    await createClient(context, {
      clientId: "client-id",
      name: "Client",
      type: "public",
      redirectUris: ["https://client.example/callback"],
    });
    const user = await createScimUser(context, {
      userName: "inactive-code@example.com",
      displayName: "Inactive Code",
    });
    await createAuthCode(context, {
      code: "inactive-code",
      clientId: "client-id",
      userSub: user.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    assert.equal((await getAuthCode(context, "inactive-code"))?.code, "inactive-code");

    await context.db.update(scimUsers).set({ active: false }).where(eq(scimUsers.userSub, user.id));

    assert.equal(await getAuthCode(context, "inactive-code"), null);
  });
});

test("SCIM groups support membership patching", async () => {
  await withContext(async (context) => {
    const user = await createScimUser(context, {
      externalId: "external-2",
      userName: "grace@example.com",
      displayName: "Grace Hopper",
    });

    const group = await createScimGroup(context, {
      externalId: "group-1",
      displayName: "Engineers",
    });

    assert.equal(group.members.length, 0);

    const patched = await patchScimGroup(context, group.id, [
      { op: "add", path: "members", value: [{ value: user.id }] },
    ]);
    assert.equal(patched.members.length, 1);
    assert.equal(patched.members[0]?.value, user.id);

    const memberRows = await context.db
      .select()
      .from(scimGroupMembers)
      .where(eq(scimGroupMembers.groupId, group.id));
    assert.equal(memberRows.length, 1);
  });
});
