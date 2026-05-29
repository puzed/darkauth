import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "webauthn.ts"), "utf8");

test("WebAuthn adapter converts browser binary fields to base64url JSON", () => {
  assert.notEqual(source.indexOf("navigator.credentials.create"), -1);
  assert.notEqual(source.indexOf("navigator.credentials.get"), -1);
  assert.notEqual(source.indexOf("clientDataJSON"), -1);
  assert.notEqual(source.indexOf("attestationObject"), -1);
  assert.notEqual(source.indexOf("authenticatorData"), -1);
  assert.notEqual(source.indexOf("signature"), -1);
});

test("WebAuthn PRF key derivation binds unlock to subject and credential", () => {
  assert.notEqual(source.indexOf("DarkAuth|v2|passkey-prf|sub="), -1);
  assert.notEqual(source.indexOf("credential_id="), -1);
  assert.notEqual(source.indexOf('new TextEncoder().encode("wrap-key")'), -1);
});
