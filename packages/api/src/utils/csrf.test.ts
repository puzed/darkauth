import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";
import { assertSameOrigin, isSameOrigin } from "./csrf.ts";

function createRequest(
  headers: Record<string, string | undefined>,
  method = "POST"
): IncomingMessage {
  return {
    method,
    headers: headers as Record<string, string | string[] | undefined>,
  } as unknown as IncomingMessage;
}

test("isSameOrigin allows safe methods without headers", () => {
  assert.equal(isSameOrigin(createRequest({}, "GET")), true);
  assert.equal(isSameOrigin(createRequest({}, "HEAD")), true);
  assert.equal(isSameOrigin(createRequest({}, "OPTIONS")), true);
});

test("isSameOrigin true when Sec-Fetch-Site is same-origin", () => {
  const request = createRequest({ host: "auth.local", "sec-fetch-site": "same-origin" });
  assert.equal(isSameOrigin(request), true);
});

test("isSameOrigin true when Origin host matches Host", () => {
  const request = createRequest({ host: "auth.local", origin: "http://auth.local" });
  assert.equal(isSameOrigin(request), true);
});

test("isSameOrigin true when Referer host matches Host", () => {
  const request = createRequest({ host: "auth.local", referer: "http://auth.local/page" });
  assert.equal(isSameOrigin(request), true);
});

test("isSameOrigin false when cross-site Origin", () => {
  const request = createRequest({ host: "auth.local", origin: "https://evil.example" });
  assert.equal(isSameOrigin(request), false);
});

test("assertSameOrigin throws on cross-site", () => {
  const request = createRequest({ host: "auth.local", origin: "https://evil.example" });
  assert.throws(() => assertSameOrigin(request));
});

test("assertSameOrigin does not throw on same-origin via Referer", () => {
  const request = createRequest({ host: "auth.local", referer: "http://auth.local/x" });
  assert.doesNotThrow(() => assertSameOrigin(request));
});
