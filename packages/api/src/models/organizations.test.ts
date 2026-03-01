import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import {
  organizationInvites,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
} from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { createOrganizationInvite } from "./organizations.ts";

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

test("createOrganizationInvite rejects unknown or non-assignable role ids", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-invite-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "org-1", name: "Org One", createdByUserSub: "user-1" })
      .returning();
    assert.ok(organization);

    const [membership] = await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "user-1", status: "active" })
      .returning();
    assert.ok(membership);

    const [managerRole] = await db
      .insert(roles)
      .values({ key: "manager", name: "Manager", system: true })
      .returning();
    assert.ok(managerRole);

    await db
      .insert(permissions)
      .values({ key: "darkauth.org:manage", description: "Manage org" })
      .onConflictDoNothing();
    await db
      .insert(rolePermissions)
      .values({ roleId: managerRole.id, permissionKey: "darkauth.org:manage" });
    await db
      .insert(organizationMemberRoles)
      .values({ organizationMemberId: membership.id, roleId: managerRole.id });

    const [nonAssignableRole] = await db
      .insert(roles)
      .values({ key: "custom", name: "Custom", system: false })
      .returning();
    assert.ok(nonAssignableRole);

    await assert.rejects(
      () =>
        createOrganizationInvite(context, "user-1", organization.id, {
          email: "invitee@example.com",
          roleIds: [nonAssignableRole.id],
        }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.message, "One or more roles were not found or cannot be assigned");
        return true;
      }
    );

    const invites = await db
      .select({ id: organizationInvites.id })
      .from(organizationInvites)
      .where(eq(organizationInvites.organizationId, organization.id));
    assert.equal(invites.length, 0);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
