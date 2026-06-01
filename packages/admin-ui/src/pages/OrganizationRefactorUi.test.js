import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");
const roleCreateSource = readFileSync(resolve(here, "RoleCreate.tsx"), "utf8");
const roleEditSource = readFileSync(resolve(here, "RoleEdit.tsx"), "utf8");
const rolesSource = readFileSync(resolve(here, "Roles.tsx"), "utf8");
const userCreateSource = readFileSync(resolve(here, "UserCreate.tsx"), "utf8");
const orgEditSource = readFileSync(resolve(here, "OrganizationEdit.tsx"), "utf8");

test("admin role UI supports organization role flags", () => {
  const source = [apiSource, roleCreateSource, roleEditSource, rolesSource].join("\n");
  assert.notEqual(source.indexOf("assignable"), -1);
  assert.notEqual(source.indexOf("defaultMember"), -1);
  assert.notEqual(source.indexOf("defaultCreator"), -1);
});

test("admin user create supports organization assignment modes", () => {
  assert.notEqual(userCreateSource.indexOf("assignmentMode"), -1);
  assert.notEqual(userCreateSource.indexOf("organizationIds"), -1);
  assert.notEqual(userCreateSource.indexOf("createPersonalOrganization"), -1);
  assert.equal(userCreateSource.indexOf("addOrganizationMember"), -1);
});

test("admin organization detail exposes tabs and enterprise placeholders", () => {
  assert.notEqual(orgEditSource.indexOf('TabsTrigger value="members"'), -1);
  assert.notEqual(orgEditSource.indexOf('TabsTrigger value="enterprise"'), -1);
  assert.notEqual(orgEditSource.indexOf("getFederationConnections"), -1);
  assert.notEqual(orgEditSource.indexOf("getScimTokens"), -1);
  assert.notEqual(orgEditSource.indexOf("Open Federation"), -1);
  assert.notEqual(orgEditSource.indexOf("Open SCIM Tokens"), -1);
});
