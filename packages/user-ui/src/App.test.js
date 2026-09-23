import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "App.tsx"), "utf8");

test("prompt=login and prompt=select_account require signing in again before authorizing", () => {
  assert.match(source, /promptValues\.has\("login"\) \|\| promptValues\.has\("select_account"\)/);
  assert.match(source, /reauthenticatedRequestId !== authRequest\.requestId/);
  assert.match(source, /sessionData && !reauthenticationRequired \? \(/);
  assert.match(source, /setReauthenticatedRequestId\(authRequest\.requestId\);/);
  assert.match(source, /writeReauthenticatedRequestId\(authRequest\.requestId\);/);
  assert.match(source, /useState<string \| null>\(\s*readReauthenticatedRequestId\(\)\s*\)/);
  const authorizeRoute = source.slice(source.indexOf('path="/authorize"'));
  const gate = authorizeRoute.indexOf("reauthenticationRequired ? (");
  const render = authorizeRoute.indexOf("<Authorize authRequest={authRequest}");
  assert.notEqual(gate, -1);
  assert.ok(gate < render);
});

test("the authorize route is gated on OTP like every other protected route", () => {
  const authorizeRoute = source.slice(
    source.indexOf('path="/authorize"'),
    source.indexOf('path="/switch-org"')
  );
  const gate = authorizeRoute.indexOf("<OtpGate>");
  const render = authorizeRoute.indexOf("<Authorize authRequest={authRequest}");
  assert.notEqual(gate, -1);
  assert.ok(gate < render);
});
