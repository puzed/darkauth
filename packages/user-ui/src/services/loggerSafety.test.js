import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceExtensions = new Set([".ts", ".tsx"]);
const forbiddenLoggerPayloads = [
  /logger\.(debug|info|warn|error)\(\s*\{\s*response\s*:/,
  /logger\.(debug|info|warn|error)\(\s*\{\s*body\s*:/,
  /logger\.(debug|info|warn|error)\(\s*\{\s*(request|finish|message|record|wrapped_drk|wrappedDrk|wrapped_key|wrappedKey|drk_jwe|darkauth_key_jwe|zk_pub|zkPub|exportKey|password|ark|cak|prf|prfOutput|recoveryKey|privateKey|privateJwk)\s*:/,
];

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

test("frontend logger calls do not pass protocol payload-shaped objects", () => {
  const offenders = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenLoggerPayloads) {
      if (pattern.test(source)) {
        offenders.push(file);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
