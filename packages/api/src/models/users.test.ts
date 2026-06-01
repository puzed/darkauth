import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { opaqueRecords, organizationMembers, organizations, users } from "../db/schema.ts";
import type { Context } from "../types.ts";
import { createUser, getUserOpaqueRecordByEmail, listUsers, updateUserBasic } from "./users.ts";

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

test("getUserOpaqueRecordByEmail can find preserved OPAQUE login identity after contact email changes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-model-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({
      sub: "opaque-identity-user",
      email: "new-contact@example.com",
      opaqueLoginIdentity: "old-login@example.com",
      name: "Identity User",
    });
    await db.insert(opaqueRecords).values({
      sub: "opaque-identity-user",
      envelope: Buffer.from([1, 2, 3]),
      serverPubkey: Buffer.from([4, 5, 6]),
    });

    const byOldLogin = await getUserOpaqueRecordByEmail(context, "old-login@example.com");
    assert.equal(byOldLogin.user.email, "new-contact@example.com");
    assert.equal(byOldLogin.identityU, "old-login@example.com");

    const byContactEmail = await getUserOpaqueRecordByEmail(context, "new-contact@example.com");
    assert.equal(byContactEmail.user.sub, "opaque-identity-user");
    assert.equal(byContactEmail.identityU, "old-login@example.com");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("createUser creates a personal organization when no assignment is provided", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-create-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    const created = await createUser(context, {
      sub: "admin-created-user",
      email: "admin-created@example.com",
      name: "Admin Created",
    });
    assert.equal(created.sub, "admin-created-user");

    const organizationRows = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.createdByUserSub, "admin-created-user"));
    assert.equal(organizationRows.length, 1);
    assert.equal(organizationRows[0]?.name, "Admin Created's Personal");

    const membershipRows = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userSub, "admin-created-user"));
    assert.equal(membershipRows.length, 1);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("createUser can assign an existing organization without creating a personal one", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-assign-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "assigned-org", name: "Assigned Org" })
      .returning();
    assert.ok(organization);

    await createUser(context, {
      sub: "assigned-user",
      email: "assigned@example.com",
      name: "Assigned User",
      organizationIds: [organization.id],
    });

    const createdPersonalRows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.createdByUserSub, "assigned-user"));
    assert.equal(createdPersonalRows.length, 0);

    const membershipRows = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userSub, "assigned-user"));
    assert.deepEqual(
      membershipRows.map((row) => row.organizationId),
      [organization.id]
    );
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("listUsers returns email verification state", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-list-verified-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    const emailVerifiedAt = new Date("2026-05-30T10:00:00.000Z");
    await db.insert(users).values({
      sub: "verified-list-user",
      email: "verified-list@example.com",
      opaqueLoginIdentity: "verified-list@example.com",
      name: "Verified List",
      emailVerifiedAt,
    });

    const result = await listUsers(context, { search: "verified-list@example.com" });
    assert.equal(result.users.length, 1);
    assert.equal(result.users[0]?.emailVerifiedAt?.toISOString(), emailVerifiedAt.toISOString());
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("admin user update toggles email verification", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-mark-verified-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({
      sub: "manual-verify-user",
      email: "old-verified@example.com",
      opaqueLoginIdentity: "old-verified@example.com",
      name: "Manual Verify",
      emailVerifiedAt: new Date("2026-05-30T10:00:00.000Z"),
    });

    const updatedEmail = await updateUserBasic(context, "manual-verify-user", {
      email: "new-verified@example.com",
    });
    assert.equal(updatedEmail.email, "new-verified@example.com");
    assert.equal(updatedEmail.emailVerifiedAt, null);

    const verified = await updateUserBasic(context, "manual-verify-user", {
      emailVerified: true,
    });
    assert.ok(verified.emailVerifiedAt);

    const unverified = await updateUserBasic(context, "manual-verify-user", {
      emailVerified: false,
    });
    assert.equal(unverified.emailVerifiedAt, null);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
