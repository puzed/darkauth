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
import {
  createOrganizationInvite,
  leaveOrganization,
  listOrganizationsForUser,
  removeMemberRole,
  removeOrganizationMember,
} from "./organizations.ts";

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
      .values({ key: "manager", name: "Manager", assignable: true })
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

test("listOrganizationsForUser includes role summaries", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-list-roles-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-roles", email: "roles@example.com", name: "Roles" });
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "roles-org", name: "Roles Org", createdByUserSub: "user-roles" })
      .returning();
    assert.ok(organization);
    const [membership] = await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "user-roles", status: "active" })
      .returning();
    assert.ok(membership);
    const [adminRole] = await db
      .insert(roles)
      .values({ key: "org_roles_summary", name: "Role Summary" })
      .returning();
    assert.ok(adminRole);
    await db
      .insert(organizationMemberRoles)
      .values({ organizationMemberId: membership.id, roleId: adminRole.id });

    const result = await listOrganizationsForUser(context, "user-roles");

    assert.deepEqual(result, [
      {
        organizationId: organization.id,
        slug: "roles-org",
        name: "Roles Org",
        forceOtp: false,
        membershipId: membership.id,
        status: "active",
        roles: [{ id: adminRole.id, key: "org_roles_summary", name: "Role Summary" }],
      },
    ]);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("leaveOrganization rejects the user's only active organization", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-leave-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({ sub: "user-1", email: "user-1@example.com", name: "User One" });
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "org-1", name: "Org One", createdByUserSub: "user-1" })
      .returning();
    assert.ok(organization);
    await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "user-1", status: "active" });

    await assert.rejects(
      () => leaveOrganization(context, "user-1", organization.id),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.message, "User must belong to at least one active organization");
        return true;
      }
    );
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("removeOrganizationMember rejects removing the last managing member", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-remove-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values([
      { sub: "manager", email: "manager@example.com", name: "Manager" },
      { sub: "member", email: "member@example.com", name: "Member" },
    ]);
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "org-1", name: "Org One", createdByUserSub: "manager" })
      .returning();
    const [otherOrganization] = await db
      .insert(organizations)
      .values({ slug: "org-2", name: "Org Two" })
      .returning();
    assert.ok(organization);
    assert.ok(otherOrganization);

    const [managerMembership] = await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "manager", status: "active" })
      .returning();
    await db.insert(organizationMembers).values({
      organizationId: otherOrganization.id,
      userSub: "manager",
      status: "active",
    });
    assert.ok(managerMembership);

    const [managerRole] = await db
      .insert(roles)
      .values({ key: "manager-remove", name: "Manager Remove" })
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
      .values({ organizationMemberId: managerMembership.id, roleId: managerRole.id });

    await assert.rejects(
      () => removeOrganizationMember(context, "manager", organization.id, managerMembership.id),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.message, "Organization must retain at least one administrator");
        return true;
      }
    );
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("removeMemberRole rejects removing the last administrator role", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-org-role-remove-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values([
      { sub: "admin", email: "admin@example.com", name: "Admin" },
      { sub: "member", email: "member@example.com", name: "Member" },
    ]);
    const [organization] = await db
      .insert(organizations)
      .values({ slug: "org-1", name: "Org One", createdByUserSub: "admin" })
      .returning();
    assert.ok(organization);

    const [adminMembership] = await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "admin", status: "active" })
      .returning();
    const [memberMembership] = await db
      .insert(organizationMembers)
      .values({ organizationId: organization.id, userSub: "member", status: "active" })
      .returning();
    assert.ok(adminMembership);
    assert.ok(memberMembership);

    const [adminRole] = await db
      .insert(roles)
      .values({ key: "org-admin", name: "Organization Admin", assignable: true })
      .returning();
    const [memberRole] = await db
      .insert(roles)
      .values({ key: "org-member", name: "Member", assignable: true })
      .returning();
    assert.ok(adminRole);
    assert.ok(memberRole);

    await db
      .insert(permissions)
      .values({ key: "darkauth.org:manage", description: "Manage org" })
      .onConflictDoNothing();
    await db
      .insert(rolePermissions)
      .values({ roleId: adminRole.id, permissionKey: "darkauth.org:manage" });
    await db
      .insert(organizationMemberRoles)
      .values({ organizationMemberId: adminMembership.id, roleId: adminRole.id });
    await db
      .insert(organizationMemberRoles)
      .values({ organizationMemberId: memberMembership.id, roleId: memberRole.id });

    await assert.rejects(
      () => removeMemberRole(context, "admin", organization.id, adminMembership.id, adminRole.id),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.message, "Organization must retain at least one administrator");
        return true;
      }
    );

    // Granting a second administrator allows the role to be removed.
    await db
      .insert(organizationMemberRoles)
      .values({ organizationMemberId: memberMembership.id, roleId: adminRole.id });

    const result = await removeMemberRole(
      context,
      "admin",
      organization.id,
      adminMembership.id,
      adminRole.id
    );
    assert.deepEqual(result, { success: true });

    const remaining = await db
      .select({ roleId: organizationMemberRoles.roleId })
      .from(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, adminMembership.id));
    assert.equal(remaining.length, 0);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
