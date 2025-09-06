import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";
import { assertSameOrigin, isSameOrigin } from "./csrf.js";

function mkReq(headers: Record<string, string | undefined>, method = "POST"): IncomingMessage {
  return {
    method,
    headers: headers as Record<string, string | string[] | undefined>,
  } as unknown as IncomingMessage;
}

test("isSameOrigin allows safe methods without headers", () => {
  assert.equal(isSameOrigin(mkReq({}, "GET")), true);
  assert.equal(isSameOrigin(mkReq({}, "HEAD")), true);
  assert.equal(isSameOrigin(mkReq({}, "OPTIONS")), true);
});

test("isSameOrigin true when Sec-Fetch-Site is same-origin", () => {
  const req = mkReq({ host: "auth.local", "sec-fetch-site": "same-origin" });
  assert.equal(isSameOrigin(req), true);
});

test("isSameOrigin true when Origin host matches Host", () => {
  const req = mkReq({ host: "auth.local", origin: "http://auth.local" });
  assert.equal(isSameOrigin(req), true);
});

test("isSameOrigin true when Referer host matches Host", () => {
  const req = mkReq({ host: "auth.local", referer: "http://auth.local/page" });
  assert.equal(isSameOrigin(req), true);
});

test("isSameOrigin false when cross-site Origin", () => {
  const req = mkReq({ host: "auth.local", origin: "https://evil.example" });
  assert.equal(isSameOrigin(req), false);
});

test("assertSameOrigin throws on cross-site", () => {
  const req = mkReq({ host: "auth.local", origin: "https://evil.example" });
  assert.throws(() => assertSameOrigin(req));
});

test("assertSameOrigin does not throw on same-origin via Referer", () => {
  const req = mkReq({ host: "auth.local", referer: "http://auth.local/x" });
  assert.doesNotThrow(() => assertSameOrigin(req));
});
