import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "SwitchOrg.tsx"), "utf8");
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../App.tsx"), "utf8");

test("hosted organization switch screen stays at /switch-org", () => {
  assert.notEqual(appSource.indexOf('path="/switch-org"'), -1);
  assert.notEqual(appSource.indexOf("<SwitchOrg"), -1);
});

test("hosted organization switch supports client return and preselected organization", () => {
  assert.notEqual(source.indexOf('searchParams.get("return_to")'), -1);
  assert.notEqual(source.indexOf('searchParams.get("client_id")'), -1);
  assert.notEqual(source.indexOf('searchParams.get("organization_id")'), -1);
  assert.notEqual(source.indexOf("requestedOrganizationId || sessionData.organizationId"), -1);
  assert.notEqual(apiSource.indexOf("return_to: options.returnTo"), -1);
  assert.notEqual(apiSource.indexOf("client_id: options.clientId"), -1);
});

test("hosted organization switch explains connected app active organization", () => {
  assert.notEqual(source.indexOf("active organization connected apps should use"), -1);
  assert.notEqual(source.indexOf("make active for connected apps"), -1);
});
