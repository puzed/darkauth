import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "OrganizationDetail.tsx"), "utf8");
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../App.tsx"), "utf8");

test("organization detail route and component are wired", () => {
  assert.notEqual(appSource.indexOf('path="/organizations/:organizationId"'), -1);
  assert.notEqual(appSource.indexOf("OrganizationDetail"), -1);
  assert.notEqual(source.indexOf("Enterprise Connections"), -1);
  assert.notEqual(source.indexOf("Members"), -1);
});

test("organization detail uses user organization management endpoints", () => {
  assert.notEqual(apiSource.indexOf("getOrganizationMembers"), -1);
  assert.notEqual(apiSource.indexOf("createOrganizationInvite"), -1);
  assert.notEqual(apiSource.indexOf("assignOrganizationMemberRoles"), -1);
  assert.notEqual(apiSource.indexOf("removeOrganizationMemberRole"), -1);
  assert.notEqual(apiSource.indexOf("getAssignableOrganizationRoles"), -1);
  assert.notEqual(apiSource.indexOf("removeOrganizationMember"), -1);
  assert.notEqual(apiSource.indexOf("leaveOrganization"), -1);
  assert.notEqual(apiSource.indexOf("deleteOrganization"), -1);
  assert.notEqual(source.indexOf("apiService.getOrganizationMembers"), -1);
  assert.notEqual(source.indexOf("apiService.createOrganizationInvite"), -1);
  assert.notEqual(source.indexOf("apiService.assignOrganizationMemberRoles"), -1);
  assert.notEqual(source.indexOf("apiService.removeOrganizationMemberRole"), -1);
  assert.notEqual(source.indexOf("apiService.removeOrganizationMember"), -1);
  assert.notEqual(source.indexOf("apiService.leaveOrganization"), -1);
  assert.notEqual(source.indexOf("apiService.deleteOrganization"), -1);
});
