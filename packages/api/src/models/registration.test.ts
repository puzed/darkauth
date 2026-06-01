import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import {
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  users,
} from "../db/schema.ts";
import { ConflictError } from "../errors.ts";
import { setSetting } from "../services/settings.ts";
import type { Context } from "../types.ts";
import { userOpaqueRegisterFinish } from "./registration.ts";

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

async function createTestContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-registration-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    config: {
      publicOrigin: "http://localhost:9080",
    },
    logger: createLogger(),
    services: {
      opaque: {
        finishRegistration: async () => ({
          envelope: new Uint8Array([1, 2, 3]),
          serverPublicKey: new Uint8Array([4, 5, 6]),
        }),
      },
    },
  } as unknown as Context;

  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };

  return { context, cleanup };
}

test("duplicate registration returns conflict by default", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await context.db.insert(users).values({
      sub: "user-existing-default",
      email: "existing-default@example.com",
      name: "Existing Default",
      createdAt: new Date(),
    });

    await assert.rejects(
      () =>
        userOpaqueRegisterFinish(context, {
          record: new Uint8Array([9, 9, 9]),
          email: "existing-default@example.com",
          name: "New Attempt",
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.message === "A user with this email address already exists"
    );
  } finally {
    await cleanup();
  }
});

test("duplicate registration returns conflict when anti-enumeration is enabled but verification is disabled", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await context.db.insert(users).values({
      sub: "user-existing-no-verify",
      email: "existing-no-verify@example.com",
      name: "Existing No Verify",
      createdAt: new Date(),
    });
    await setSetting(context, "users.prevent_email_enumeration_on_registration", true);
    await setSetting(context, "users.require_email_verification", false);

    await assert.rejects(
      () =>
        userOpaqueRegisterFinish(context, {
          record: new Uint8Array([9, 9, 9]),
          email: "existing-no-verify@example.com",
          name: "New Attempt",
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.message === "A user with this email address already exists"
    );
  } finally {
    await cleanup();
  }
});

test("duplicate registration returns conflict when anti-enumeration is enabled and verification is enabled but smtp is unavailable", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await context.db.insert(users).values({
      sub: "user-existing-no-smtp",
      email: "existing-no-smtp@example.com",
      name: "Existing No SMTP",
      createdAt: new Date(),
    });
    await setSetting(context, "users.prevent_email_enumeration_on_registration", true);
    await setSetting(context, "users.require_email_verification", true);
    await setSetting(context, "email.smtp.enabled", false);

    await assert.rejects(
      () =>
        userOpaqueRegisterFinish(context, {
          record: new Uint8Array([9, 9, 9]),
          email: "existing-no-smtp@example.com",
          name: "New Attempt",
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.message === "A user with this email address already exists"
    );
  } finally {
    await cleanup();
  }
});

test("duplicate registration returns conflict when anti-enumeration path cannot send the notice email", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await context.db.insert(users).values({
      sub: "user-existing-send-fail",
      email: "existing-send-fail@example.com",
      name: "Existing Send Fail",
      createdAt: new Date(),
    });

    await setSetting(context, "users.prevent_email_enumeration_on_registration", true);
    await setSetting(context, "users.require_email_verification", true);
    await setSetting(context, "email.smtp.enabled", true);
    await setSetting(context, "email.transport", "smtp");
    await setSetting(context, "email.from", "noreply@example.com");
    await setSetting(context, "email.smtp.host", "127.0.0.1");
    await setSetting(context, "email.smtp.port", 1);
    await setSetting(context, "email.smtp.user", "user");
    await setSetting(context, "email.smtp.password", "pass");

    await assert.rejects(
      () =>
        userOpaqueRegisterFinish(context, {
          record: new Uint8Array([9, 9, 9]),
          email: "existing-send-fail@example.com",
          name: "New Attempt",
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.message === "A user with this email address already exists"
    );
  } finally {
    await cleanup();
  }
});

test("registration creates a personal organization with default member and creator roles", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    const result = await userOpaqueRegisterFinish(context, {
      record: new Uint8Array([9, 9, 9]),
      email: "new-personal@example.com",
      name: "New Personal",
    });

    assert.equal(result.requiresEmailVerification, false);
    assert.ok(result.sessionId);

    const organizationRows = await context.db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        createdByUserSub: organizations.createdByUserSub,
      })
      .from(organizations)
      .where(eq(organizations.createdByUserSub, result.sub));
    assert.equal(organizationRows.length, 1);
    assert.equal(organizationRows[0]?.name, "New Personal's Personal");
    assert.match(organizationRows[0]?.slug || "", /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{1,6}$/);

    const membershipRows = await context.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userSub, result.sub));
    assert.equal(membershipRows.length, 1);

    const roleRows = await context.db
      .select({ key: roles.key })
      .from(organizationMemberRoles)
      .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
      .where(eq(organizationMemberRoles.organizationMemberId, membershipRows[0]?.id || ""));
    assert.deepEqual(roleRows.map((role) => role.key).sort(), ["member", "org_admin"]);
  } finally {
    await cleanup();
  }
});
