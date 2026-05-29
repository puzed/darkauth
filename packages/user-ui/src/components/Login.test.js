import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Login.tsx"), "utf8");
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");

test("Login exposes passkey sign-in through WebAuthn APIs", () => {
  assert.notEqual(source.indexOf("Sign in with passkey"), -1);
  assert.notEqual(source.indexOf("apiService.webAuthnLoginStart"), -1);
  assert.notEqual(source.indexOf("serializeAuthenticationResponse"), -1);
  assert.notEqual(source.indexOf("derivePasskeyPrfWrapKey"), -1);
  assert.notEqual(source.indexOf("saveUnlockedArk"), -1);
});

test("Login resolves federation routes but keeps password fallback", () => {
  assert.notEqual(source.indexOf(".getFederationRoute"), -1);
  assert.notEqual(source.indexOf("/api/user/federation/oidc/start"), -1);
  assert.notEqual(source.indexOf("Continue with"), -1);
  assert.notEqual(source.indexOf("opaqueService.startLogin"), -1);
  assert.notEqual(apiSource.indexOf("/federation/route"), -1);
});
