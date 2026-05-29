import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Settings.tsx"), "utf8");

test("Settings includes SCIM provisioning policy controls", () => {
  assert.notEqual(source.indexOf("users.scim.only_provisioned_sign_in"), -1);
  assert.notEqual(source.indexOf("users.scim.require_key_unlock_for_zk"), -1);
  assert.notEqual(source.indexOf("users.scim.allow_password_envelopes"), -1);
  assert.notEqual(source.indexOf("users.scim.allow_passkey_prf_envelopes"), -1);
  assert.notEqual(source.indexOf("users.scim.allow_trusted_device_approval"), -1);
});

test("Settings includes SCIM mapping controls", () => {
  assert.notEqual(source.indexOf("users.scim.unknown_group_policy"), -1);
  assert.notEqual(source.indexOf("users.scim.group_role_mappings"), -1);
  assert.notEqual(source.indexOf("Ignore group"), -1);
  assert.notEqual(source.indexOf("Reject update"), -1);
});
