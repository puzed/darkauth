import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Authorize.tsx"), "utf8");

test("generateNewKeys copies DRK before clearing it for ZK handoff", () => {
  const copyIndex = source.indexOf("const drkForHandoff = drk.slice();");
  const clearIndex = source.indexOf("cryptoService.clearSensitiveData(drk);", copyIndex);
  const jweIndex = source.indexOf(
    "cryptoService.createDrkJWE(\n            drkForHandoff",
    clearIndex
  );

  assert.notEqual(copyIndex, -1);
  assert.notEqual(clearIndex, -1);
  assert.notEqual(jweIndex, -1);
  assert.ok(copyIndex < clearIndex);
  assert.ok(clearIndex < jweIndex);
});

test("Authorize never posts DRK JWE to finalize", () => {
  assert.equal(source.includes("drkJwe:"), false);
});
