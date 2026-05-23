import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { organizationMembers, organizations, users } from "../db/schema.ts";
import { AppError, ForbiddenError } from "../errors.ts";
import type { Context } from "../types.ts";
import { resolveAuthorizationOrganizationContext } from "./rbac.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-rbac-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };

  return { context, cleanup };
}

async function createUser(context: Context, sub: string) {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
}

async function createOrganization(context: Context, slug: string, createdByUserSub: string) {
  const [organization] = await context.db
    .insert(organizations)
    .values({
      slug,
      name: slug,
      createdByUserSub,
    })
    .returning();
  assert.ok(organization);
  return organization;
}

async function addMembership(
  context: Context,
  userSub: string,
  organizationId: string,
  status: "active" | "suspended" = "active"
) {
  await context.db.insert(organizationMembers).values({
    organizationId,
    userSub,
    status,
  });
}

test("resolveAuthorizationOrganizationContext returns an explicit active organization", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-explicit");
    const organization = await createOrganization(context, "explicit", "user-explicit");
    await addMembership(context, "user-explicit", organization.id);

    const resolved = await resolveAuthorizationOrganizationContext(context, "user-explicit", {
      explicitOrganizationId: organization.id,
    });

    assert.equal(resolved.organizationId, organization.id);
    assert.equal(resolved.organizationSlug, "explicit");
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext rejects explicit organizations without active membership", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-invalid-explicit");
    const organization = await createOrganization(
      context,
      "invalid-explicit",
      "user-invalid-explicit"
    );
    await addMembership(context, "user-invalid-explicit", organization.id, "suspended");

    await assert.rejects(
      () =>
        resolveAuthorizationOrganizationContext(context, "user-invalid-explicit", {
          explicitOrganizationId: organization.id,
        }),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.message === "Your account cannot sign in with the selected organization."
    );
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext selects the only active organization", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-single");
    const organization = await createOrganization(context, "single", "user-single");
    await addMembership(context, "user-single", organization.id);

    const resolved = await resolveAuthorizationOrganizationContext(context, "user-single", {});

    assert.equal(resolved.organizationId, organization.id);
    assert.equal(resolved.organizationSlug, "single");
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext reports multi-org ambiguity with details", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-multi");
    const first = await createOrganization(context, "multi-one", "user-multi");
    const second = await createOrganization(context, "multi-two", "user-multi");
    await addMembership(context, "user-multi", first.id);
    await addMembership(context, "user-multi", second.id);

    await assert.rejects(
      () => resolveAuthorizationOrganizationContext(context, "user-multi", {}),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "ORG_CONTEXT_REQUIRED");
        assert.deepEqual(error.details, { reason: "multiple_active_organizations" });
        return true;
      }
    );
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext uses a valid session organization", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-session");
    const first = await createOrganization(context, "session-one", "user-session");
    const second = await createOrganization(context, "session-two", "user-session");
    await addMembership(context, "user-session", first.id);
    await addMembership(context, "user-session", second.id);

    const resolved = await resolveAuthorizationOrganizationContext(context, "user-session", {
      sessionOrganizationId: second.id,
    });

    assert.equal(resolved.organizationId, second.id);
    assert.equal(resolved.organizationSlug, "session-two");
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext falls back when session organization is stale", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-stale");
    const active = await createOrganization(context, "active-after-stale", "user-stale");
    const stale = await createOrganization(context, "stale", "user-stale");
    await addMembership(context, "user-stale", active.id);
    await addMembership(context, "user-stale", stale.id, "suspended");

    const resolved = await resolveAuthorizationOrganizationContext(context, "user-stale", {
      sessionOrganizationId: stale.id,
    });

    assert.equal(resolved.organizationId, active.id);
    assert.equal(resolved.organizationSlug, "active-after-stale");
  } finally {
    await cleanup();
  }
});

test("resolveAuthorizationOrganizationContext rejects users with no active organization", async () => {
  const { context, cleanup } = await createTestContext();
  try {
    await createUser(context, "user-zero");
    const organization = await createOrganization(context, "zero", "user-zero");
    await addMembership(context, "user-zero", organization.id, "suspended");

    await assert.rejects(
      () => resolveAuthorizationOrganizationContext(context, "user-zero", {}),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.message === "Your account is not a member of any active organization."
    );
  } finally {
    await cleanup();
  }
});
