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
  class MockPublicKeyCredential {}
  const fromBase64Url = (value) => {
    const base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(Buffer.from(base64, "base64"));
  };
  const navigator = { credentials: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === "./crypto") {
        return {
          default: { hkdf: async () => new Uint8Array() },
          fromBase64Url,
          toBase64Url: (value) => Buffer.from(new Uint8Array(value)).toString("base64url"),
        };
      }
      throw new Error(`Unexpected import ${specifier}`);
    },
    ArrayBuffer,
    Buffer,
    TextEncoder,
    Uint8Array,
    navigator,
    window: { PublicKeyCredential: MockPublicKeyCredential },
    PublicKeyCredential: MockPublicKeyCredential,
  };
  vm.runInNewContext(compiled, sandbox);
  return { ...module.exports, MockPublicKeyCredential, navigator };
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

test("WebAuthn registration ceremony decodes browser inputs and serializes the credential", async () => {
  const {
    createPasskeyCredential,
    serializeRegistrationResponse,
    MockPublicKeyCredential,
    navigator,
  } = loadWebAuthnModule();
  let observedPublicKey;
  navigator.credentials.create = async ({ publicKey }) => {
    observedPublicKey = publicKey;
    const credential = new MockPublicKeyCredential();
    credential.id = "credential-id";
    credential.rawId = Uint8Array.from([7, 8, 9]).buffer;
    credential.type = "public-key";
    credential.response = {
      clientDataJSON: Uint8Array.from([1, 2]).buffer,
      attestationObject: Uint8Array.from([3, 4]).buffer,
      getTransports: () => ["internal"],
    };
    credential.getClientExtensionResults = () => ({ prf: { enabled: true } });
    return credential;
  };

  const credential = await createPasskeyCredential({
    challenge: Buffer.from([1, 2, 3]).toString("base64url"),
    rp: { name: "DarkAuth" },
    user: {
      id: Buffer.from([4, 5, 6]).toString("base64url"),
      name: "user@example.com",
      displayName: "User",
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    excludeCredentials: [{ id: Buffer.from([10, 11]).toString("base64url"), type: "public-key" }],
    extensions: { prf: { eval: { first: Buffer.from([12, 13]).toString("base64url") } } },
  });
  const serialized = serializeRegistrationResponse(credential);

  assert.deepEqual([...observedPublicKey.challenge], [1, 2, 3]);
  assert.deepEqual([...observedPublicKey.user.id], [4, 5, 6]);
  assert.deepEqual([...observedPublicKey.excludeCredentials[0].id], [10, 11]);
  assert.deepEqual([...new Uint8Array(observedPublicKey.extensions.prf.eval.first)], [12, 13]);
  assert.deepEqual(JSON.parse(JSON.stringify(serialized)), {
    id: "credential-id",
    rawId: "BwgJ",
    type: "public-key",
    response: {
      clientDataJSON: "AQI",
      attestationObject: "AwQ",
      transports: ["internal"],
    },
    clientExtensionResults: { prf: { enabled: true } },
  });
});

test("WebAuthn login ceremony decodes PRF options, serializes assertion, and exposes PRF output", async () => {
  const {
    getPasskeyCredential,
    getPasskeyPrfResult,
    serializeAuthenticationResponse,
    MockPublicKeyCredential,
    navigator,
  } = loadWebAuthnModule();
  let observedPublicKey;
  navigator.credentials.get = async ({ publicKey }) => {
    observedPublicKey = publicKey;
    const credential = new MockPublicKeyCredential();
    credential.id = "credential-login";
    credential.rawId = Uint8Array.from([14, 15]).buffer;
    credential.type = "public-key";
    credential.response = {
      clientDataJSON: Uint8Array.from([1]).buffer,
      authenticatorData: Uint8Array.from([2]).buffer,
      signature: Uint8Array.from([3]).buffer,
      userHandle: Uint8Array.from([4]).buffer,
    };
    credential.getClientExtensionResults = () => ({
      prf: { results: { first: Uint8Array.from([31, 32, 33]) } },
    });
    return credential;
  };

  const credential = await getPasskeyCredential({
    challenge: Buffer.from([21, 22]).toString("base64url"),
    allowCredentials: [{ id: Buffer.from([23, 24]).toString("base64url"), type: "public-key" }],
    extensions: {
      prf: {
        evalByCredential: {
          "credential-login": { first: Buffer.from([25, 26]).toString("base64url") },
        },
      },
    },
  });
  const serialized = serializeAuthenticationResponse(credential);

  assert.deepEqual([...observedPublicKey.challenge], [21, 22]);
  assert.deepEqual([...observedPublicKey.allowCredentials[0].id], [23, 24]);
  assert.deepEqual(
    [
      ...new Uint8Array(
        observedPublicKey.extensions.prf.evalByCredential["credential-login"].first
      ),
    ],
    [25, 26]
  );
  assert.deepEqual([...getPasskeyPrfResult(credential)], [31, 32, 33]);
  assert.deepEqual(JSON.parse(JSON.stringify(serialized.response)), {
    clientDataJSON: "AQ",
    authenticatorData: "Ag",
    signature: "Aw",
    userHandle: "BA",
  });
  assert.equal(serialized.id, "credential-login");
  assert.equal(serialized.rawId, "Dg8");
  assert.equal(serialized.type, "public-key");
  assert.deepEqual([...serialized.clientExtensionResults.prf.results.first], [31, 32, 33]);
});

test("WebAuthn mocked ceremonies handle auth-only passkeys without PRF output", async () => {
  const {
    getPasskeyCredential,
    getPasskeyPrfResult,
    passkeyPrfEnabled,
    MockPublicKeyCredential,
    navigator,
  } = loadWebAuthnModule();
  navigator.credentials.get = async () => {
    const credential = new MockPublicKeyCredential();
    credential.id = "auth-only";
    credential.rawId = Uint8Array.from([1]).buffer;
    credential.type = "public-key";
    credential.response = {
      clientDataJSON: Uint8Array.from([2]).buffer,
      authenticatorData: Uint8Array.from([3]).buffer,
      signature: Uint8Array.from([4]).buffer,
      userHandle: null,
    };
    credential.getClientExtensionResults = () => ({});
    return credential;
  };

  const credential = await getPasskeyCredential({
    challenge: Buffer.from([5]).toString("base64url"),
  });

  assert.equal(passkeyPrfEnabled(credential), false);
  assert.equal(getPasskeyPrfResult(credential), null);
});

test("WebAuthn mocked ceremonies reject cancelled browser operations", async () => {
  const { createPasskeyCredential, getPasskeyCredential, navigator } = loadWebAuthnModule();
  navigator.credentials.create = async () => null;
  navigator.credentials.get = async () => null;

  await assert.rejects(
    () =>
      createPasskeyCredential({
        challenge: Buffer.from([1]).toString("base64url"),
        rp: { name: "DarkAuth" },
        user: {
          id: Buffer.from([2]).toString("base64url"),
          name: "user@example.com",
          displayName: "User",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      }),
    /Passkey registration was cancelled/
  );
  await assert.rejects(
    () =>
      getPasskeyCredential({
        challenge: Buffer.from([3]).toString("base64url"),
      }),
    /Passkey sign-in was cancelled/
  );
});
