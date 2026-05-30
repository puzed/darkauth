import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "SettingsSecurity.tsx"), "utf8");
const settingsViewSource = readFileSync(resolve(here, "SettingsSecurityView.tsx"), "utf8");
const unlockSource = readFileSync(resolve(here, "KeyUnlockPanel.tsx"), "utf8");
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");

test("Settings security manages trusted devices and approval requests", () => {
  assert.notEqual(source.indexOf("Trusted Devices"), -1);
  assert.notEqual(source.indexOf("Pending Device Approvals"), -1);
  assert.notEqual(source.indexOf("deviceKeyStore.createKeyHandle"), -1);
  assert.notEqual(source.indexOf("cryptoService.wrapKeyMaterialWithAesKey"), -1);
  assert.notEqual(source.indexOf("keyHandle: handle"), -1);
  assert.notEqual(source.indexOf("envelopeId"), -1);
  assert.notEqual(source.indexOf("api.getTrustedDevices"), -1);
  assert.notEqual(source.indexOf("api.revokeTrustedDevice"), -1);
  assert.notEqual(source.indexOf("api.denyDeviceApproval"), -1);
});

test("Settings security approval encrypts the ARK to the requesting device", () => {
  assert.notEqual(source.indexOf("cryptoService.createDeviceApprovalJWE"), -1);
  assert.notEqual(source.indexOf("api.approveDeviceApproval"), -1);
  assert.notEqual(source.indexOf("deviceKeyStore.getApprovalPrivateKey"), -1);
  assert.notEqual(source.indexOf("approvalProof"), -1);
  assert.notEqual(source.indexOf("approval.new_device_public_jwk"), -1);
});

test("Settings security distinguishes passkey authentication from PRF unlock", () => {
  assert.notEqual(source.indexOf("Passkeys"), -1);
  assert.notEqual(source.indexOf("verified WebAuthn PRF support"), -1);
  assert.notEqual(source.indexOf("Auth + unlock passkeys"), -1);
  assert.notEqual(source.indexOf("Auth-only passkeys"), -1);
  assert.notEqual(source.indexOf("api.getWebAuthnCredentials"), -1);
  assert.notEqual(source.indexOf("api.revokeWebAuthnCredential"), -1);
  assert.notEqual(source.indexOf("Sign-in and encryption unlock"), -1);
  assert.notEqual(source.indexOf("Sign-in only"), -1);
  assert.notEqual(source.indexOf("registerPasskey"), -1);
  assert.notEqual(source.indexOf("api.webAuthnRegisterStart"), -1);
  assert.notEqual(source.indexOf("api.createPasskeyPrfEnvelope"), -1);
  assert.equal(source.indexOf("Passkey setup unavailable"), -1);
});

test("Settings security creates high entropy recovery key envelopes", () => {
  assert.notEqual(source.indexOf("Recovery Key"), -1);
  assert.notEqual(source.indexOf("crypto.getRandomValues(secretBytes)"), -1);
  assert.notEqual(source.indexOf("cryptoService.deriveRecoveryKeyMaterial"), -1);
  assert.notEqual(source.indexOf("cryptoService.deriveRecoveryVerifier"), -1);
  assert.notEqual(source.indexOf("api.createRecoveryKey"), -1);
  assert.notEqual(source.indexOf("Create recovery key"), -1);
  assert.notEqual(source.indexOf("Rotate recovery key"), -1);
  assert.notEqual(apiSource.indexOf("RecoveryKeyCreateRequest"), -1);
  assert.notEqual(source.indexOf("revokeExisting: activeRecoveryKeys.length > 0"), -1);
  assert.notEqual(apiSource.indexOf("/crypto/recovery-keys"), -1);
  assert.equal(apiSource.indexOf("/crypto/keybag/recovery"), -1);
});

test("dashboard and settings expose password unlock for locked key state", () => {
  assert.notEqual(settingsViewSource.indexOf("KeyUnlockPanel"), -1);
  assert.notEqual(unlockSource.indexOf("Unlock with Password"), -1);
  assert.notEqual(unlockSource.indexOf("opaqueService.startLogin"), -1);
  assert.notEqual(unlockSource.indexOf("api.passwordVerifyFinish"), -1);
  assert.notEqual(unlockSource.indexOf("unlockArkWithExportKey"), -1);
  assert.notEqual(unlockSource.indexOf("saveUnlockedArk"), -1);
  assert.notEqual(unlockSource.indexOf('type === "password"'), -1);
});

test("key-locked dashboard and settings can request another-browser approval", () => {
  assert.notEqual(unlockSource.indexOf("Accept on Another Browser"), -1);
  assert.notEqual(unlockSource.indexOf("api.createDeviceApproval"), -1);
  assert.notEqual(unlockSource.indexOf("api.consumeDeviceApproval"), -1);
  assert.notEqual(unlockSource.indexOf("cryptoService.decryptDeviceApprovalJWE"), -1);
  assert.notEqual(unlockSource.indexOf("Accept on Another Browser"), -1);
  assert.notEqual(source.indexOf("Refresh approvals"), -1);
});

test("trusted device actions use unlocked ARK instead of requiring export key", () => {
  assert.notEqual(source.indexOf("loadArkFromAvailableLocalUnlocks"), -1);
  assert.equal(source.indexOf("loadExportKey"), -1);
  assert.notEqual(unlockSource.indexOf("unlockArkWithLocalTrustedDevice"), -1);
  assert.notEqual(unlockSource.indexOf("deviceKeyStore.getKey"), -1);
  assert.notEqual(source.indexOf("This browser is trusted for encrypted key approvals."), -1);
});

test("Settings security separates sign-in methods from encryption unlock methods", () => {
  assert.notEqual(source.indexOf("Sign-in Methods"), -1);
  assert.notEqual(source.indexOf("Password sign-in"), -1);
  assert.notEqual(source.indexOf("Enterprise SSO"), -1);
  assert.notEqual(source.indexOf("Connected identities"), -1);
  assert.notEqual(source.indexOf("Encryption Unlock Methods"), -1);
  assert.notEqual(source.indexOf("Encryption unlock methods are managed separately"), -1);
  assert.notEqual(apiSource.indexOf("getConnectedIdentities"), -1);
  assert.notEqual(apiSource.indexOf("/federation/identities"), -1);
});

test("Settings security applies enterprise unlock policy controls", () => {
  assert.notEqual(source.indexOf("getUnlockPolicy"), -1);
  assert.notEqual(source.indexOf("unlockPolicy.allowPasskeyPrfEnvelope"), -1);
  assert.notEqual(source.indexOf("unlockPolicy.allowTrustedDeviceApproval"), -1);
  assert.notEqual(source.indexOf("Your organization manages allowed unlock methods"), -1);
  assert.notEqual(unlockSource.indexOf("getUnlockPolicy"), -1);
  assert.notEqual(unlockSource.indexOf("Password encryption unlock is disabled"), -1);
  assert.notEqual(unlockSource.indexOf("Trusted-browser approval is disabled"), -1);
});
