import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "KeyUnlockPanel.tsx"), "utf8");

test("key unlock panel uses password proof before marking keys unlocked", () => {
  assert.notEqual(source.indexOf("Unlock with Password"), -1);
  assert.notEqual(source.indexOf("opaqueService.startLogin"), -1);
  assert.notEqual(source.indexOf("api.passwordVerifyFinish"), -1);
  assert.notEqual(source.indexOf("saveUnlockedArk"), -1);
  assert.equal(source.indexOf("session/key-unlock"), -1);
});

test("key unlock panel can request and consume another-browser approval", () => {
  const requestStart = source.indexOf("const requestDeviceApproval = async () => {");
  const pollingStart = source.indexOf("const startDeviceApprovalPolling = useCallback(");

  assert.notEqual(requestStart, -1);
  assert.notEqual(pollingStart, -1);
  assert.notEqual(source.indexOf("Unlock with Another Device"), -1);
  assert.notEqual(source.indexOf("Approve from a trusted browser"), -1);
  assert.notEqual(source.indexOf("Use password instead"), -1);
  assert.equal(source.indexOf("trustedDeviceCount"), -1);
  assert.notEqual(source.indexOf("api.createDeviceApproval({", requestStart), -1);
  assert.notEqual(source.indexOf("newDevicePublicJwk: publicJwk", requestStart), -1);
  const keyUnlockStateHash = "stateHash: await sha256Base64Url(`key-unlock:" + "$" + "{sub}:";
  assert.notEqual(source.indexOf(keyUnlockStateHash, requestStart), -1);
  assert.notEqual(
    source.indexOf("verificationCodeHash: await sha256Base64Url(code)", requestStart),
    -1
  );
  assert.notEqual(source.indexOf("api.consumeDeviceApproval", pollingStart), -1);
  assert.notEqual(source.indexOf("cryptoService.decryptDeviceApprovalJWE(encryptedApproval"), -1);
});
