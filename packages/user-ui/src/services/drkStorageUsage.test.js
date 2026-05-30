import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (sourceExtensions.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

function functionBody(source, name) {
  const start = source.indexOf(`const ${name} = async`);
  assert.notEqual(start, -1);
  const nextFunction = source.indexOf("\n  const ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

test("Auth UI does not persist DRK through drkStorage outside legacy clearing", () => {
  const offenders = [];
  for (const file of sourceFiles(root)) {
    if (file.endsWith(join("services", "drkStorage.ts"))) continue;
    const source = readFileSync(file, "utf8");
    if (/\b(saveDrk|loadDrk|clearDrk)\b/.test(source)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("session export keys stay memory-only", () => {
  const source = readFileSync(join(root, "services", "sessionKey.ts"), "utf8");
  assert.match(source, /memoryExportKeys/);
  assert.doesNotMatch(source, /setItem\(LEGACY_PREFIX/);
  assert.doesNotMatch(source, /saveExportKey[\s\S]*sessionStorage\.setItem/);
  assert.doesNotMatch(source, /saveExportKey[\s\S]*localStorage\.setItem/);
});

test("authorization recovery and trusted-device unlock keep ARK in memory storage", () => {
  const authorizeSource = readFileSync(join(root, "components", "Authorize.tsx"), "utf8");
  const unlockedArkSource = readFileSync(join(root, "services", "unlockedArk.ts"), "utf8");
  const recoveryUnlock = functionBody(authorizeSource, "unlockWithRecoveryKey");
  const trustedDeviceUnlock = functionBody(authorizeSource, "unlockWithTrustedDevice");
  const deviceApproval = functionBody(authorizeSource, "consumeDeviceApproval");
  const storagePattern = /\b(localStorage|sessionStorage|indexedDB)\b/;

  assert.notEqual(authorizeSource.indexOf("const finishUnlockWithArk"), -1);
  assert.notEqual(recoveryUnlock.indexOf("finishUnlockWithArk"), -1);
  assert.notEqual(trustedDeviceUnlock.indexOf("finishUnlockWithArk"), -1);
  assert.notEqual(deviceApproval.indexOf("finalizeWithZk"), -1);
  assert.doesNotMatch(recoveryUnlock, storagePattern);
  assert.doesNotMatch(trustedDeviceUnlock, storagePattern);
  assert.doesNotMatch(deviceApproval, storagePattern);
  assert.match(unlockedArkSource, /const unlockedArks = new Map/);
  assert.match(unlockedArkSource, /new Uint8Array\(ark\)/);
  assert.doesNotMatch(unlockedArkSource, storagePattern);
});

test("user UI key flows keep plaintext ARK and CAK out of browser storage APIs", () => {
  const checked = [
    join(root, "components", "Authorize.tsx"),
    join(root, "components", "KeyUnlockPanel.tsx"),
    join(root, "components", "SettingsSecurity.tsx"),
    join(root, "services", "unlockedArk.ts"),
  ];
  for (const file of checked) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /localStorage\.(setItem|getItem)/, file);
    assert.doesNotMatch(source, /sessionStorage\.(setItem|getItem)/, file);
    assert.doesNotMatch(source, /document\.cookie\s*=/, file);
    assert.doesNotMatch(source, /indexedDB\.open/, file);
  }
});

test("trusted-device persistence stores key handles through IndexedDB, not plaintext key bytes", () => {
  const source = readFileSync(join(root, "services", "deviceKeyStore.ts"), "utf8");
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /CryptoKey/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /sessionStorage\.setItem/);
  assert.doesNotMatch(source, /wrapped_key/);
  assert.doesNotMatch(source, /\bark\b/);
  assert.doesNotMatch(source, /cak/i);
});
