import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "main.tsx"), "utf8");

test("branding preview delegates user surfaces to shared user-ui components", () => {
  assert.match(source, /from "@DarkAuth\/user-ui\/src\/exports"/);
  for (const component of [
    "Authorize",
    "AuthorizePageFrame",
    "Dashboard",
    "LoginView",
    "Profile",
    "SettingsSecurityView",
  ]) {
    assert.match(source, new RegExp(`\\b${component}\\b`));
  }
  assert.equal(/function\s+PreviewOrganizations\b/.test(source), false);
  assert.equal(/function\s+PreviewAuthorizeScopes\b/.test(source), false);
  assert.equal(source.includes("./preview.css"), false);
  assert.equal(existsSync(resolve(here, "preview.css")), false);
});

test("branding authorize preview uses the real authorize component for variants", () => {
  assert.match(source, /<AuthorizePageFrame>/);
  assert.match(source, /<Authorize\s/);
  assert.match(source, /requireOrganizationSelection/);
  assert.match(source, /hasZkDeliveryScope/);
  assert.match(source, /authorizeOrganizationsForVariant/);
});
