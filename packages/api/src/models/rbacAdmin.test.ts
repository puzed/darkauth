import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import {
  addOrganizationMemberRolesAdmin,
  removeOrganizationMemberRoleAdmin,
  setRolePermissionsAdmin,
  updateRoleAdmin,
} from "./rbacAdmin.ts";

test("updateRoleAdmin allows system roles", async () => {
  const updatedRole = {
    id: "role-1",
    key: "member",
    name: "Default Member",
    description: "Default role",
    system: true,
  };
  const context = {
    db: {
      query: {
        roles: {
          findFirst: async () => ({ id: "role-1", system: true }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [updatedRole],
          }),
        }),
      }),
    },
  } as unknown as Context;

  const result = await updateRoleAdmin(context, "role-1", { name: "Default Member" });

  assert.equal(result, updatedRole);
});

test("setRolePermissionsAdmin allows system roles", async () => {
  let deleteCalled = false;
  const context = {
    db: {
      query: {
        roles: {
          findFirst: async () => ({ id: "role-1", system: true }),
        },
      },
      transaction: async (callback: (trx: unknown) => Promise<void>) => {
        await callback({
          delete: () => ({
            where: () => {
              deleteCalled = true;
            },
          }),
        });
      },
    },
  } as unknown as Context;

  const result = await setRolePermissionsAdmin(context, "role-1", []);

  assert.equal(deleteCalled, true);
  assert.deepEqual(result, { roleId: "role-1", permissionKeys: [] });
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
