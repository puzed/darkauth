import assert from "node:assert/strict";
import { test } from "node:test";
import cryptoService from "./crypto.ts";

function fixedBytes(length, offset = 0) {
  return Uint8Array.from({ length }, (_value, index) => (index + offset) % 256);
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

test("password export key unwraps ARK and derives stable CAK for the same client", async () => {
  const sub = "user-sub";
  const keyId = "ark_user-sub_1";
  const clientId = "app-web";
  const exportKey = fixedBytes(32, 1);
  const ark = fixedBytes(32, 101);
  const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sub);
  const wrappedArk = await cryptoService.wrapDRK(ark, keys.wrapKey, sub);
  const unwrappedArk = await cryptoService.unwrapDRK(wrappedArk, keys.wrapKey, sub);
  const firstCak = await cryptoService.deriveClientAppKey(unwrappedArk, {
    sub,
    keyId,
    clientId,
    audience: clientId,
  });
  const secondCak = await cryptoService.deriveClientAppKey(unwrappedArk, {
    sub,
    keyId,
    clientId,
    audience: clientId,
  });

  assert.deepEqual(unwrappedArk, ark);
  assert.equal(hex(firstCak), hex(secondCak));
  assert.notEqual(hex(firstCak), hex(ark));
});

test("different clients receive different CAKs from the same ARK", async () => {
  const ark = fixedBytes(32, 22);
  const base = {
    sub: "user-sub",
    keyId: "ark_user-sub_1",
  };
  const firstCak = await cryptoService.deriveClientAppKey(ark, {
    ...base,
    clientId: "app-web",
    audience: "app-web",
  });
  const secondCak = await cryptoService.deriveClientAppKey(ark, {
    ...base,
    clientId: "app-admin",
    audience: "app-admin",
  });

  assert.notEqual(hex(firstCak), hex(secondCak));
});

test("same client receives stable org-scoped CAKs and different CAKs across orgs", async () => {
  const ark = fixedBytes(32, 44);
  const base = {
    sub: "user-sub",
    keyId: "ark_user-sub_1",
    clientId: "app-web",
    audience: "app-web",
  };
  const orgOneCak = await cryptoService.deriveClientAppKey(ark, {
    ...base,
    organizationId: "org-one",
  });
  const orgOneRepeatCak = await cryptoService.deriveClientAppKey(ark, {
    ...base,
    organizationId: "org-one",
  });
  const orgTwoCak = await cryptoService.deriveClientAppKey(ark, {
    ...base,
    organizationId: "org-two",
  });
  const accountWideCak = await cryptoService.deriveClientAppKey(ark, base);

  assert.equal(hex(orgOneCak), hex(orgOneRepeatCak));
  assert.notEqual(hex(orgOneCak), hex(orgTwoCak));
  assert.notEqual(hex(orgOneCak), hex(accountWideCak));
});
