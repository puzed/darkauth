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

test("OPAQUE export keys are never held after login", () => {
  const offenders = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    if (/\b(saveExportKey|loadExportKey|sessionKey")\b/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("browser storage writes are limited to the theme, the re-authentication marker and the session ARK envelope", () => {
  const writers = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    if (/\b(localStorage|sessionStorage)\.setItem\(/.test(source)) writers.push(file);
  }
  assert.deepEqual(writers.sort(), [
    join(root, "App.tsx"),
    join(root, "components", "ThemeToggle.tsx"),
    join(root, "services", "sessionUnlock.ts"),
  ]);
  const appSource = readFileSync(join(root, "App.tsx"), "utf8");
  const appWrites = appSource.match(/(localStorage|sessionStorage)\.setItem\([^;]+;/g) || [];
  assert.deepEqual(appWrites, ["sessionStorage.setItem(REAUTHENTICATED_REQUEST_KEY, requestId);"]);
  const themeSource = readFileSync(join(root, "components", "ThemeToggle.tsx"), "utf8");
  assert.match(themeSource, /localStorage\.setItem\("daTheme", theme\)/);
});

test("session ARK storage holds only the AES-GCM envelope under DarkAuth_session_ark:", () => {
  const source = readFileSync(join(root, "services", "sessionUnlock.ts"), "utf8");
  const writes = source.match(/localStorage\.setItem\([^;]+;/g) || [];
  assert.match(source, /const STORAGE_PREFIX = "DarkAuth_session_ark:";/);
  assert.deepEqual(writes, ["localStorage.setItem(storageKey(sub), JSON.stringify(envelope));"]);
  assert.match(source, /ct: toBase64Url\(ciphertext\)/);
  assert.doesNotMatch(source, /(ark|plaintext): toBase64Url/);
  assert.match(source, /name: "AES-GCM", iv, additionalData: envelopeAad\(sub, keyId\)/);
});

test("authorization unlocks keep plaintext ARK in memory and persist only through saveUnlockedArk", () => {
  const authorizeSource = readFileSync(join(root, "components", "Authorize.tsx"), "utf8");
  const unlockedArkSource = readFileSync(join(root, "services", "unlockedArk.ts"), "utf8");
  const recoveryUnlock = functionBody(authorizeSource, "unlockWithRecoveryKey");
  const trustedDeviceUnlock = functionBody(authorizeSource, "unlockWithTrustedDevice");
  const deviceApproval = functionBody(authorizeSource, "consumeDeviceApproval");
  const storagePattern = /\b(localStorage|sessionStorage|indexedDB)\b/;

  assert.notEqual(authorizeSource.indexOf("const finishUnlockWithArk"), -1);
  assert.notEqual(recoveryUnlock.indexOf("finishUnlockWithArk"), -1);
  assert.notEqual(trustedDeviceUnlock.indexOf("finishUnlockWithArk"), -1);
  assert.notEqual(deviceApproval.indexOf("finishUnlockWithArk"), -1);
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
