import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(resolve(here, "Dashboard.tsx"), "utf8");
const layoutSource = readFileSync(resolve(here, "UserLayout.tsx"), "utf8");
const unlockSource = readFileSync(resolve(here, "KeyUnlockPanel.tsx"), "utf8");

test("apps landing keeps app launch primary and moves account tasks to navigation", () => {
  assert.notEqual(dashboardSource.indexOf("Your apps"), -1);
  assert.notEqual(dashboardSource.indexOf("Search apps"), -1);
  assert.notEqual(dashboardSource.indexOf("appGrid"), -1);
  assert.notEqual(dashboardSource.indexOf("No apps available"), -1);
  assert.notEqual(layoutSource.indexOf("/security"), -1);
  assert.notEqual(layoutSource.indexOf("/profile"), -1);
  assert.notEqual(dashboardSource.indexOf("KeyUnlockPanel"), -1);
  assert.notEqual(unlockSource.indexOf("Unlock with Password"), -1);
  assert.equal(dashboardSource.indexOf("Profile and security controls"), -1);
  assert.equal(dashboardSource.indexOf("securityActions"), -1);
  assert.equal(dashboardSource.indexOf("Passkeys & Security"), -1);
  assert.equal(dashboardSource.indexOf("Reset OTP"), -1);
  assert.equal(layoutSource.indexOf("Resetup OTP"), -1);
});
