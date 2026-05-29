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
