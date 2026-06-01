import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import {
  authCodes,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  pendingAuth,
  roles,
  scimGroupMembers,
  scimUsers,
  sessions,
  users,
} from "../db/schema.ts";
import { UnauthorizedError } from "../errors.ts";
import { createSession } from "../services/sessions.ts";
import { setSetting } from "../services/settings.ts";
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
  revokeScimBearerTokenForOrganization,
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

async function createOrganization(
  context: Context,
  id = randomUUID(),
  slug = `org-${id.slice(0, 8)}`
) {
  await context.db.insert(organizations).values({
    id,
    slug,
    name: slug,
  });
  return { id, slug };
}

async function createScimAuth(
  context: Context,
  organizationId?: string,
  organizationSlug?: string
) {
  const organization = await createOrganization(context, organizationId, organizationSlug);
  const token = await createScimBearerToken(context, {
    name: "Directory Sync",
    organizationId: organization.id,
  });
  const scim = await requireScimBearerToken(context, token.token);
  return { organization, token, scim };
}

test("SCIM bearer tokens are hashed, accepted, and revoked", async () => {
  await withContext(async (context) => {
    const organization = await createOrganization(context);
    const created = await createScimBearerToken(context, {
      name: "Directory Sync",
      organizationId: organization.id,
    });

    assert.ok(created.id);
    assert.ok(created.token.startsWith("da_scim_"));
    assert.notEqual(created.tokenPrefix, created.token);

    const auth = await requireScimBearerToken(context, created.token);
    assert.equal(auth.tokenId, created.id);
    assert.equal(auth.organizationId, organization.id);

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

test("SCIM bearer token revocation can be constrained to an organization", async () => {
  await withContext(async (context) => {
    const first = await createScimAuth(context);
    const second = await createScimAuth(context);

    await assert.rejects(
      () => revokeScimBearerTokenForOrganization(context, second.organization.id, first.token.id),
      /SCIM token not found/
    );

    await revokeScimBearerTokenForOrganization(context, first.organization.id, first.token.id);

    await assert.rejects(
      () => requireScimBearerToken(context, first.token.token),
      (error: unknown) => error instanceof UnauthorizedError
    );
    assert.equal(
      (await requireScimBearerToken(context, second.token.token)).tokenId,
      second.token.id
    );
  });
});

test("SCIM bearer tokens reject expiry and list inputs reject malformed filters while capping pagination", async () => {
  await withContext(async (context) => {
    const { scim, organization } = await createScimAuth(context);
    const expired = await createScimBearerToken(context, {
      name: "Expired",
      organizationId: organization.id,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    await assert.rejects(
      () => requireScimBearerToken(context, expired.token),
      (error: unknown) => error instanceof UnauthorizedError
    );

    for (let index = 0; index < 105; index += 1) {
      await createScimUser(context, scim, {
        userName: `page-${index}@example.com`,
        displayName: `Page ${index}`,
      });
    }

    await assert.rejects(
      () => listScimUsers(context, scim, { filter: 'userName sw "page"' }),
      /Unsupported SCIM filter/
    );

    const listed = await listScimUsers(context, scim, { startIndex: 1, count: 10_000 });
    assert.equal(listed.totalResults, 105);
    assert.equal(listed.itemsPerPage, 100);
    assert.equal(listed.Resources.length, 100);
  });
});

test("SCIM user conformance accepts common IdP payload shapes", async () => {
  await withContext(async (context) => {
    const { scim } = await createScimAuth(context);
    const oktaUser = await createScimUser(context, scim, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      externalId: "00u123",
      userName: "okta@example.com",
      name: { givenName: "Okta", familyName: "User" },
      emails: [{ value: "okta@example.com", primary: true, type: "work" }],
      active: true,
    } as never);
    const azureUser = await createScimUser(context, scim, {
      schemas: [
        "urn:ietf:params:scim:schemas:core:2.0:User",
        "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
      ],
      externalId: "azure-123",
      userName: "azure@example.com",
      displayName: "Azure User",
      emails: [{ value: "azure@example.com" }],
      active: true,
      "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
        department: "Engineering",
      },
    } as never);

    assert.equal(oktaUser.userName, "okta@example.com");
    assert.equal(oktaUser.displayName, "Okta User");
    assert.equal(oktaUser.emails[0]?.value, "okta@example.com");
    assert.equal(azureUser.userName, "azure@example.com");
    assert.equal(azureUser.displayName, "Azure User");
  });
});

test("SCIM users support create, get, list, filter, patch, and deactivation revocation", async () => {
  await withContext(async (context) => {
    const { scim, organization } = await createScimAuth(context);
    const user = await createScimUser(context, scim, {
      externalId: "external-1",
      userName: "ada@example.com",
      name: { formatted: "Ada Lovelace" },
      active: true,
    });

    assert.equal(user.externalId, "external-1");
    assert.equal(user.userName, "ada@example.com");
    assert.equal(user.active, true);

    const fetched = await getScimUser(context, scim, user.id);
    assert.equal(fetched.id, user.id);

    const listed = await listScimUsers(context, scim, {
      filter: 'externalId eq "external-1"',
      startIndex: 1,
      count: 10,
    });
    assert.equal(listed.totalResults, 1);
    assert.equal(listed.Resources[0]?.id, user.id);

    const patched = await patchScimUser(context, scim, user.id, [
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
      data: { sub: user.id, organizationId: organization.id },
      refreshToken: "refresh-hash",
      refreshTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    await deactivateScimUser(context, scim, user.id);

    const remaining = await context.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userSub, user.id));
    assert.equal(remaining.length, 0);

    await assert.rejects(
      () => createSession(context, "user", { sub: user.id, organizationId: organization.id }),
      (error: unknown) => error instanceof UnauthorizedError
    );
  });
});

test("SCIM deactivation invalidates outstanding auth codes and pending auth for that user", async () => {
  await withContext(async (context) => {
    const { scim, organization } = await createScimAuth(context);
    await createClient(context, {
      clientId: "client-id",
      name: "Client",
      type: "public",
      redirectUris: ["https://client.example/callback"],
    });
    const deprovisioned = await createScimUser(context, scim, {
      userName: "deprovisioned@example.com",
      displayName: "Deprovisioned User",
    });
    const active = await createScimUser(context, scim, {
      userName: "active@example.com",
      displayName: "Active User",
    });

    await createAuthCode(context, {
      code: "deprovisioned-code",
      clientId: "client-id",
      userSub: deprovisioned.id,
      organizationId: organization.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createAuthCode(context, {
      code: "active-code",
      clientId: "client-id",
      userSub: active.id,
      organizationId: organization.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createPendingAuth(context, {
      requestId: "deprovisioned-request",
      clientId: "client-id",
      userSub: deprovisioned.id,
      organizationId: organization.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      origin: "https://auth.example.com",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await createPendingAuth(context, {
      requestId: "active-request",
      clientId: "client-id",
      userSub: active.id,
      organizationId: organization.id,
      redirectUri: "https://client.example/callback",
      scope: "openid",
      origin: "https://auth.example.com",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    await deactivateScimUser(context, scim, deprovisioned.id);

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
    const { scim, organization } = await createScimAuth(context);
    await createClient(context, {
      clientId: "client-id",
      name: "Client",
      type: "public",
      redirectUris: ["https://client.example/callback"],
    });
    const user = await createScimUser(context, scim, {
      userName: "inactive-code@example.com",
      displayName: "Inactive Code",
    });
    await createAuthCode(context, {
      code: "inactive-code",
      clientId: "client-id",
      userSub: user.id,
      organizationId: organization.id,
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
    const { scim } = await createScimAuth(context);
    const user = await createScimUser(context, scim, {
      externalId: "external-2",
      userName: "grace@example.com",
      displayName: "Grace Hopper",
    });

    const group = await createScimGroup(context, scim, {
      externalId: "group-1",
      displayName: "Engineers",
    });

    assert.equal(group.members.length, 0);

    const patched = await patchScimGroup(context, scim, group.id, [
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

test("SCIM connections cannot read users from another organization", async () => {
  await withContext(async (context) => {
    const first = await createScimAuth(context);
    const second = await createScimAuth(context);
    const user = await createScimUser(context, first.scim, {
      externalId: "boundary-user",
      userName: "boundary@example.com",
      displayName: "Boundary User",
    });
    await assert.rejects(() => getScimUser(context, second.scim, user.id), /SCIM user not found/);
    const secondUser = await createScimUser(context, second.scim, {
      externalId: "boundary-user-second",
      userName: "boundary@example.com",
      displayName: "Boundary User Second",
    });

    const firstList = await listScimUsers(context, first.scim, {
      filter: 'externalId eq "boundary-user"',
    });
    const secondList = await listScimUsers(context, second.scim, {
      filter: 'externalId eq "boundary-user"',
    });

    assert.equal(firstList.totalResults, 1);
    assert.equal(secondList.totalResults, 0);
    assert.equal(secondUser.id, user.id);
  });
});

test("SCIM deprovisioning preserves unrelated organization membership and sessions", async () => {
  await withContext(async (context) => {
    const { scim, organization } = await createScimAuth(context);
    const unrelated = await createOrganization(context);
    const user = await createScimUser(context, scim, {
      userName: "multi-org@example.com",
      displayName: "Multi Org",
    });
    await context.db.insert(organizationMembers).values({
      organizationId: unrelated.id,
      userSub: user.id,
      status: "active",
    });
    await context.db.insert(sessions).values([
      {
        id: "connection-session",
        cohort: "user",
        userSub: user.id,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        data: { sub: user.id, organizationId: organization.id },
      },
      {
        id: "unrelated-session",
        cohort: "user",
        userSub: user.id,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        data: { sub: user.id, organizationId: unrelated.id },
      },
    ]);

    await deactivateScimUser(context, scim, user.id);

    const memberships = await context.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userSub, user.id))
      .orderBy(organizationMembers.organizationId);
    const remainingSessions = await context.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userSub, user.id));

    assert.equal(
      memberships.find((membership) => membership.organizationId === organization.id)?.status,
      "suspended"
    );
    assert.equal(
      memberships.find((membership) => membership.organizationId === unrelated.id)?.status,
      "active"
    );
    assert.deepEqual(
      remainingSessions.map((session) => session.id),
      ["unrelated-session"]
    );
  });
});

test("SCIM deprovision action delete removes local user and returns a tombstone response", async () => {
  await withContext(async (context) => {
    const { scim } = await createScimAuth(context);
    const deleteScim = {
      ...scim,
      deprovisionAction: "delete_user",
      deleteUserSafety: "allow_delete",
    };
    const user = await createScimUser(context, deleteScim, {
      userName: "deleted@example.com",
      displayName: "Deleted User",
    });

    const deleted = await deactivateScimUser(context, deleteScim, user.id);
    const userRows = await context.db.select().from(users).where(eq(users.sub, user.id));
    const scimRows = await context.db
      .select()
      .from(scimUsers)
      .where(eq(scimUsers.userSub, user.id));

    assert.equal(deleted.id, user.id);
    assert.equal(deleted.active, false);
    assert.equal(userRows.length, 0);
    assert.equal(scimRows.length, 0);
  });
});

test("SCIM delete-user deprovisioning fails closed when unrelated memberships exist", async () => {
  await withContext(async (context) => {
    const { scim } = await createScimAuth(context);
    const unrelated = await createOrganization(context);
    const deleteScim = {
      ...scim,
      deprovisionAction: "delete_user",
      deleteUserSafety: "fail_closed",
    };
    const user = await createScimUser(context, deleteScim, {
      userName: "delete-safe@example.com",
      displayName: "Delete Safe",
    });
    await context.db.insert(organizationMembers).values({
      organizationId: unrelated.id,
      userSub: user.id,
      status: "active",
    });

    const deprovisioned = await deactivateScimUser(context, deleteScim, user.id);
    const userRows = await context.db.select().from(users).where(eq(users.sub, user.id));
    const unrelatedMembership = await context.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, unrelated.id),
        eq(organizationMembers.userSub, user.id)
      ),
    });

    assert.equal(deprovisioned.active, false);
    assert.equal(userRows.length, 1);
    assert.equal(unrelatedMembership?.status, "active");
  });
});

test("SCIM group mappings synchronize organization membership and roles", async () => {
  await withContext(async (context) => {
    const { scim } = await createScimAuth(
      context,
      "11111111-1111-4111-8111-111111111111",
      "engineering"
    );
    const user = await createScimUser(context, scim, {
      userName: "mapped@example.com",
      displayName: "Mapped User",
    });
    await context.db.insert(roles).values({
      id: "22222222-2222-4222-8222-222222222222",
      key: "engineer",
      name: "Engineer",
      system: true,
    });
    await context.db.insert(users).values({
      sub: "manual-user",
      email: "manual@example.com",
      opaqueLoginIdentity: "manual@example.com",
      name: "Manual User",
    });
    const [manualMembership] = await context.db
      .insert(organizationMembers)
      .values({
        organizationId: "11111111-1111-4111-8111-111111111111",
        userSub: "manual-user",
        status: "active",
      })
      .returning();
    await context.db.insert(organizationMemberRoles).values({
      organizationMemberId: manualMembership?.id || "",
      roleId: "22222222-2222-4222-8222-222222222222",
    });
    await setSetting(context, "users.scim.group_role_mappings", {
      mappings: [
        {
          scim_display_name: "Engineers",
          organization_slug: "engineering",
          role_keys: ["engineer"],
        },
      ],
    });

    const group = await createScimGroup(context, scim, {
      displayName: "Engineers",
      members: [{ value: user.id }],
    });

    const [membership] = await context.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, "11111111-1111-4111-8111-111111111111"));
    assert.equal(membership?.organizationId, "11111111-1111-4111-8111-111111111111");
    assert.equal(membership?.status, "active");

    const assignedRoles = await context.db
      .select()
      .from(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, membership?.id || ""));
    assert.ok(assignedRoles.some((role) => role.roleId === "22222222-2222-4222-8222-222222222222"));

    await patchScimGroup(context, scim, group.id, [{ op: "remove", path: "members", value: [] }]);

    const updatedMembership = await context.db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, membership?.id || ""),
    });
    const remainingRoles = await context.db
      .select()
      .from(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, membership?.id || ""));
    const manualAfterSync = await context.db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, manualMembership?.id || ""),
    });
    const manualRolesAfterSync = await context.db
      .select()
      .from(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, manualMembership?.id || ""));
    assert.equal(updatedMembership?.status, "suspended");
    assert.equal(
      remainingRoles.some((role) => role.roleId === "22222222-2222-4222-8222-222222222222"),
      false
    );
    assert.equal(manualAfterSync?.status, "active");
    assert.equal(manualRolesAfterSync.length, 1);
  });
});

test("SCIM unknown group reject policy rejects unmapped groups", async () => {
  await withContext(async (context) => {
    const { scim } = await createScimAuth(context);
    await setSetting(context, "users.scim.unknown_group_policy", "reject");

    await assert.rejects(
      () =>
        createScimGroup(context, scim, {
          displayName: "Unmapped",
        }),
      (error: unknown) => error instanceof Error && error.message === "SCIM group has no mapping"
    );
  });
});
