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
const scimTokensSource = readFileSync(resolve(here, "ScimTokens.tsx"), "utf8");
const federationSource = readFileSync(resolve(here, "FederationConnections.tsx"), "utf8");
const organizationComboboxSource = readFileSync(
  resolve(here, "../components/form/organization-combobox.tsx"),
  "utf8"
);
const auditLogsSource = readFileSync(resolve(here, "AuditLogs.tsx"), "utf8");

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
  assert.notEqual(orgEditSource.indexOf("/audit?organizationId="), -1);
  assert.equal(orgEditSource.indexOf('navigate("/audit-logs")'), -1);
});

test("admin organization selectors use async typeahead", () => {
  assert.notEqual(organizationComboboxSource.indexOf("getOrganizationsPaged"), -1);
  assert.notEqual(organizationComboboxSource.indexOf("limit: 25"), -1);
  assert.notEqual(organizationComboboxSource.indexOf("Load more"), -1);
  assert.notEqual(scimTokensSource.indexOf("OrganizationCombobox"), -1);
  assert.notEqual(federationSource.indexOf("OrganizationCombobox"), -1);
  assert.equal(scimTokensSource.indexOf("limit: 100"), -1);
  assert.equal(federationSource.indexOf("limit: 100"), -1);
});

test("admin audit logs preserve organization filters", () => {
  assert.notEqual(auditLogsSource.indexOf("organizationIdFilter"), -1);
  assert.notEqual(apiSource.indexOf("organizationId?: string"), -1);
  assert.notEqual(apiSource.indexOf('params.append("organizationId"'), -1);
});
