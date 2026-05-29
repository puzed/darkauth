import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "SettingsSecurity.tsx"), "utf8");
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
  assert.notEqual(source.indexOf("approval.new_device_public_jwk"), -1);
});

test("Settings security distinguishes passkey authentication from PRF unlock", () => {
  assert.notEqual(source.indexOf("Passkeys"), -1);
  assert.notEqual(source.indexOf("verified WebAuthn PRF support"), -1);
  assert.notEqual(source.indexOf("Auth + unlock passkeys"), -1);
  assert.notEqual(source.indexOf("Auth-only passkeys"), -1);
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
  assert.notEqual(apiSource.indexOf("/crypto/recovery-keys"), -1);
  assert.equal(apiSource.indexOf("/crypto/keybag/recovery"), -1);
});
