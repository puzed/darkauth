import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "KeyUnlockPanel.tsx"), "utf8");

test("key unlock panel uses password proof before marking keys unlocked", () => {
  assert.notEqual(source.indexOf("Unlock with Password"), -1);
  assert.notEqual(source.indexOf("opaqueService.startLogin"), -1);
  assert.notEqual(source.indexOf("api.passwordVerifyFinish"), -1);
  assert.notEqual(source.indexOf("saveUnlockedArk"), -1);
  assert.equal(source.indexOf("session/key-unlock"), -1);
});
