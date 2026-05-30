import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(resolve(here, "Dashboard.tsx"), "utf8");
const layoutSource = readFileSync(resolve(here, "UserLayout.tsx"), "utf8");
const unlockSource = readFileSync(resolve(here, "KeyUnlockPanel.tsx"), "utf8");

test("dashboard and account menu expose passkey security settings", () => {
  assert.notEqual(dashboardSource.indexOf("Passkeys & Security"), -1);
  assert.notEqual(layoutSource.indexOf("Passkeys & Security"), -1);
  assert.notEqual(dashboardSource.indexOf("KeyUnlockPanel"), -1);
  assert.notEqual(unlockSource.indexOf("Unlock with Password"), -1);
  assert.equal(dashboardSource.indexOf("Reset OTP"), -1);
  assert.equal(layoutSource.indexOf("Resetup OTP"), -1);
});
