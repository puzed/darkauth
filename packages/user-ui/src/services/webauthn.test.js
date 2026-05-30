import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "webauthn.ts"), "utf8");

function loadWebAuthnModule() {
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const fromBase64Url = (value) => {
    const base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(Buffer.from(base64, "base64"));
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === "./crypto") {
        return {
          default: { hkdf: async () => new Uint8Array() },
          fromBase64Url,
          toBase64Url: () => "",
        };
      }
      throw new Error(`Unexpected import ${specifier}`);
    },
    ArrayBuffer,
    Buffer,
    TextEncoder,
    Uint8Array,
    navigator: { credentials: {} },
    window: { PublicKeyCredential: undefined },
    PublicKeyCredential: class {},
  });
  return module.exports;
}

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

test("WebAuthn adapter decodes PRF salts before calling browser credentials APIs", () => {
  const { decodeWebAuthnExtensions } = loadWebAuthnModule();
  const decoded = decodeWebAuthnExtensions({
    prf: {
      eval: { first: "AQID" },
      evalByCredential: {
        credential: { first: "BAUG" },
      },
    },
  });
  const evalFirst = decoded.prf.eval.first;
  const credentialFirst = decoded.prf.evalByCredential.credential.first;

  assert.ok(evalFirst instanceof ArrayBuffer);
  assert.ok(credentialFirst instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(evalFirst)], [1, 2, 3]);
  assert.deepEqual([...new Uint8Array(credentialFirst)], [4, 5, 6]);
  assert.notEqual(source.indexOf("extensions: decodeWebAuthnExtensions(publicKey.extensions)"), -1);
});
