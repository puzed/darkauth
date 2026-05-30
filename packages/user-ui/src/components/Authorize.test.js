import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Authorize.tsx"), "utf8");

test("generateNewKeys copies DRK before clearing it for ZK handoff", () => {
  const copyIndex = source.indexOf("const drkForHandoff = drk.slice();");
  const clearIndex = source.indexOf("cryptoService.clearSensitiveData(drk);", copyIndex);
  const finalizeIndex = source.indexOf("await finalizeWithZk(drkForHandoff);", clearIndex);

  assert.notEqual(copyIndex, -1);
  assert.notEqual(clearIndex, -1);
  assert.notEqual(finalizeIndex, -1);
  assert.ok(copyIndex < clearIndex);
  assert.ok(clearIndex < finalizeIndex);
});

test("Authorize never posts DRK JWE to finalize", () => {
  assert.equal(source.includes("drkJwe:"), false);
});

test("Authorize sends only key hashes to finalize", () => {
  assert.notEqual(source.indexOf("zkKeyHash:"), -1);
  assert.notEqual(source.indexOf("drkHash:"), -1);
  assert.equal(source.includes("jwe:"), false);
});

test("Authorize v2 handoff derives CAK and uses darkauth_key_jwe fragment", () => {
  assert.notEqual(source.indexOf("cryptoService.deriveClientAppKey"), -1);
  assert.notEqual(source.indexOf("cryptoService.createClientKeyJWE"), -1);
  assert.notEqual(source.indexOf('fragmentName: "darkauth_key_jwe"'), -1);
  assert.notEqual(source.indexOf('key_kind: "client_app_key"'), -1);
});

test("Authorize models key-locked ZK sessions before delivery", () => {
  assert.notEqual(source.indexOf("keyLockedForZk"), -1);
  assert.notEqual(source.indexOf("Unlock your encryption keys to continue."), -1);
  assert.notEqual(source.indexOf("setKeyUnlocked(true)"), -1);
});

test("Authorize only prompts for key unlock when the pending client requested ZK", () => {
  const keyLockedExpression = source.match(/const keyLockedForZk = ([^;]+);/);
  const promptGuard = source.match(/if \(approve && keyLockedForZk\) \{[\s\S]*?return;\n\s*\}/);

  assert.ok(keyLockedExpression);
  assert.equal(keyLockedExpression[1], "authRequest.hasZk && !keyUnlocked");
  assert.ok(promptGuard);
  assert.notEqual(
    promptGuard[0].indexOf('setError("Unlock your encryption keys to continue.")'),
    -1
  );
});

test("Authorize finalizes non-ZK requests without local key unwrap", () => {
  const zkBranch = source.indexOf("if (approve && authRequest.hasZk) {");
  const nonZkFinalize = source.indexOf(
    "const authResponse = await apiService.authorize(",
    zkBranch
  );
  const redirect = source.indexOf(
    "window.location.href = authResponse.redirectUrl;",
    nonZkFinalize
  );

  assert.notEqual(zkBranch, -1);
  assert.notEqual(nonZkFinalize, -1);
  assert.notEqual(redirect, -1);
});

test("Authorize offers trusted device approval before password unlock", () => {
  assert.notEqual(source.indexOf("Accept on another device"), -1);
  assert.notEqual(source.indexOf("apiService.createDeviceApproval"), -1);
  assert.notEqual(source.indexOf("apiService.consumeDeviceApproval"), -1);
  assert.notEqual(source.indexOf("cryptoService.decryptDeviceApprovalJWE"), -1);
});

test("Authorize starts another-device approval with OAuth and verification binding", () => {
  const requestStart = source.indexOf("const requestDeviceApproval = async () => {");
  const createIndex = source.indexOf("apiService.createDeviceApproval({", requestStart);
  const pollIndex = source.indexOf("startDeviceApprovalPolling", createIndex);

  assert.notEqual(requestStart, -1);
  assert.notEqual(createIndex, -1);
  assert.notEqual(pollIndex, -1);
  assert.notEqual(source.indexOf("const code = generateVerificationCode();", requestStart), -1);
  assert.notEqual(source.indexOf("authorizationRequestId: authRequest.requestId", createIndex), -1);
  assert.notEqual(source.indexOf("clientId,", createIndex), -1);
  assert.notEqual(
    source.indexOf('stateHash: await sha256Base64Url(authRequest.state || "")', createIndex),
    -1
  );
  assert.notEqual(
    source.indexOf("verificationCodeHash: await sha256Base64Url(code)", createIndex),
    -1
  );
});

test("Authorize consumes another-device approval with the requested public key proof", () => {
  const consumeHelperStart = source.indexOf("const consumeDeviceApproval = async (");
  const decryptIndex = source.indexOf("cryptoService.decryptDeviceApprovalJWE", consumeHelperStart);
  const finalizeIndex = source.indexOf("await finalizeWithZk(ark);", decryptIndex);
  const pollingStart = source.indexOf("const startDeviceApprovalPolling = (");
  const consumeIndex = source.indexOf("apiService.consumeDeviceApproval", pollingStart);
  const helperCallIndex = source.indexOf(
    "await consumeDeviceApproval(consumed, privateKey);",
    consumeIndex
  );

  assert.notEqual(consumeHelperStart, -1);
  assert.notEqual(decryptIndex, -1);
  assert.notEqual(finalizeIndex, -1);
  assert.notEqual(pollingStart, -1);
  assert.notEqual(consumeIndex, -1);
  assert.notEqual(helperCallIndex, -1);
  assert.notEqual(
    source.indexOf(
      "newDeviceProof: await sha256Base64Url(JSON.stringify(publicJwk))",
      consumeIndex
    ),
    -1
  );
  assert.ok(decryptIndex < finalizeIndex);
  assert.ok(consumeIndex < helperCallIndex);
});

test("Authorize uses distinct unlock methods instead of old-password recovery", () => {
  assert.notEqual(source.indexOf("Unlock encryption keys"), -1);
  assert.notEqual(source.indexOf("unlockMethod"), -1);
  assert.notEqual(source.indexOf("unlockWithRecoveryKey"), -1);
  assert.notEqual(source.indexOf("unlockWithTrustedDevice"), -1);
  assert.notEqual(source.indexOf("unlockWithPasskey"), -1);
  assert.equal(source.indexOf("Recover with old password"), -1);
});

test("Authorize stores unlocked ARK in memory only for ZK finalization", () => {
  assert.notEqual(source.indexOf("saveUnlockedArk"), -1);
  assert.notEqual(source.indexOf("loadUnlockedArk"), -1);
  assert.notEqual(source.indexOf("apiService.recordRecoveryKeyUse"), -1);
  assert.notEqual(source.indexOf("deviceKeyStore.getKey"), -1);
});

test("multi-organization authorize keeps the organization picker visible", () => {
  const summaryExpression = source.match(/const showOrganizationSummary = ([^;]+);/);

  assert.ok(summaryExpression);
  assert.equal(
    summaryExpression[1],
    "activeOrganizations.length === 1 || selectedOrganizationLocked"
  );
});
