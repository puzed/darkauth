import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "pendingUnlock.ts"), "utf8");

test("new account keys are created only when the server says none exists", () => {
  assert.match(source, /if \(status === 404\) return true;/);
  assert.match(source, /throw error;/);
  assert.doesNotMatch(source, /\.catch\(\(\) => false\)/);
  const guard = source.slice(
    source.indexOf("async function accountHasNoKeyYet"),
    source.indexOf("export async function unlockOrCreatePasswordArk")
  );
  assert.notEqual(guard.indexOf("await apiService.getWrappedDrk();"), -1);
  const creation = source.slice(source.indexOf("export async function unlockOrCreatePasswordArk"));
  const guardCall = creation.indexOf("await accountHasNoKeyYet()");
  const generate = creation.indexOf("cryptoService.generateDRK()");
  assert.notEqual(guardCall, -1);
  assert.ok(guardCall < generate);
});

test("the OTP journey stays in the app so the pending unlock survives", () => {
  const otpVerify = readFileSync(resolve(here, "..", "components", "OtpVerifyView.tsx"), "utf8");
  const otpFlow = readFileSync(resolve(here, "..", "components", "OtpFlow.tsx"), "utf8");
  assert.match(otpVerify, /navigate\("\/otp\/setup\?forced=1", \{ replace: true \}\)/);
  assert.match(otpFlow, /navigate\("\/otp\/verify", \{ replace: true \}\)/);
  assert.doesNotMatch(otpVerify, /window\.location\.replace\("\/otp\//);
  assert.doesNotMatch(otpFlow, /window\.location\.replace\("\/otp\//);
  for (const source of [otpVerify, otpFlow]) {
    assert.match(source, /await completePendingUnlock\(\);/);
  }
});
