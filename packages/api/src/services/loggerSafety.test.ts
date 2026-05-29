import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceExtensions = new Set([".ts"]);
const forbiddenLoggerPayloads = [
  /\.(debug|info|warn|error|trace|fatal)\(\s*\{\s*(request|finish|message|record|opaquePayload|opaqueRecord|wrapped_drk|wrappedDrk|wrapped_key|wrappedKey|drk_jwe|darkauth_key_jwe|zk_pub|zkPub|exportKey|password|ark|cak|prf|prfOutput|recoveryKey|privateKey|privateJwk|refreshToken|accessToken|idToken|authorizationCode|codeVerifier|clientSecret)\s*:/,
  /\.(debug|info|warn|error|trace|fatal)\(\s*\{\s*(postgresUri|uri|smtpPassword|cookie|authorization)\s*:/,
];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (sourceExtensions.has(extname(path)) && !path.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

test("api logger calls do not pass obvious secret fields directly", () => {
  const offenders: string[] = [];
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
