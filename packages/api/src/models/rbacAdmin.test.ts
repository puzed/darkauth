import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";
import {
  addOrganizationMemberRolesAdmin,
  removeOrganizationMemberRoleAdmin,
  setRolePermissionsAdmin,
} from "./rbacAdmin.js";

test("setRolePermissionsAdmin rejects system roles", async () => {
  const context = {
    db: {
      query: {
        roles: {
          findFirst: async () => ({ id: "role-1", system: true }),
        },
      },
    },
  } as unknown as Context;

  await assert.rejects(
    () => setRolePermissionsAdmin(context, "role-1", []),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, "System roles cannot be updated");
      return true;
    }
  );
});

test("addOrganizationMemberRolesAdmin rejects empty role ids", async () => {
  const context = {
    db: {
      query: {
        organizationMembers: {
          findFirst: async () => ({ id: "member-1", organizationId: "org-1" }),
        },
      },
    },
  } as unknown as Context;

  await assert.rejects(
    () => addOrganizationMemberRolesAdmin(context, "org-1", "member-1", []),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, "At least one role id is required");
      return true;
    }
  );
});

test("removeOrganizationMemberRoleAdmin rejects unknown member", async () => {
  const context = {
    db: {
      query: {
        organizationMembers: {
          findFirst: async () => null,
        },
      },
    },
  } as unknown as Context;

  await assert.rejects(
    () => removeOrganizationMemberRoleAdmin(context, "org-1", "member-1", "role-1"),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundError);
      assert.equal(error.message, "Organization member not found");
      return true;
    }
  );
});
