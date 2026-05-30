import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "App.tsx"), "utf8");
const componentSources = [
  "components/Dashboard.tsx",
  "components/SettingsSecurity.tsx",
  "components/SettingsSecurityView.tsx",
  "components/ChangePasswordView.tsx",
  "components/OtpFlow.tsx",
  "components/OtpSetupView.tsx",
  "components/OtpVerifyView.tsx",
  "components/SwitchOrg.tsx",
].map((file) => readFileSync(resolve(here, file), "utf8"));

test("user portal routes use the new app, security, and profile destinations", () => {
  assert.notEqual(appSource.indexOf('path="/apps"'), -1);
  assert.notEqual(appSource.indexOf('path="/security"'), -1);
  assert.notEqual(appSource.indexOf('path="/profile"'), -1);
  assert.notEqual(appSource.indexOf('path="/security/password"'), -1);
  assert.notEqual(appSource.indexOf('path="/dashboard"'), -1);
  assert.notEqual(appSource.indexOf('to="/apps"'), -1);
  assert.notEqual(appSource.indexOf('path="/settings"'), -1);
  assert.notEqual(appSource.indexOf('to="/security"'), -1);
  assert.notEqual(appSource.indexOf('path="/change-password"'), -1);
  assert.notEqual(appSource.indexOf('to="/security/password"'), -1);
  assert.notEqual(appSource.indexOf('navigate("/apps")'), -1);
  assert.notEqual(appSource.indexOf('<Navigate to="/security/password" replace />'), -1);
});

test("user portal components do not navigate to old dashboard settings paths", () => {
  const joined = componentSources.join("\n");
  assert.equal(joined.indexOf('"/dashboard"'), -1);
  assert.equal(joined.indexOf('"/settings"'), -1);
  assert.equal(joined.indexOf('"/change-password"'), -1);
  assert.notEqual(joined.indexOf('"/apps"'), -1);
  assert.notEqual(joined.indexOf('"/security"'), -1);
  assert.notEqual(joined.indexOf('"/security/password"'), -1);
});
