import assert from "node:assert/strict";
import { test } from "node:test";
import { isUserCorsOriginAllowed, type UserCorsPolicy } from "./createServer.ts";

function policy(): UserCorsPolicy {
  return {
    cachedAt: Date.now(),
    firstPartyOrigins: new Set(["https://my.wylde.net"]),
    publicSpaOrigins: new Set(["https://atlas.wylde.net"]),
  };
}

test("user CORS allows SDK user endpoints for registered public SPA origins", () => {
  const corsPolicy = policy();

  assert.equal(
    isUserCorsOriginAllowed("/api/user/organizations", "https://atlas.wylde.net", corsPolicy),
    true
  );
  assert.equal(
    isUserCorsOriginAllowed("/api/user/session", "https://atlas.wylde.net", corsPolicy),
    true
  );
});

test("user CORS rejects SDK user endpoints for unregistered origins", () => {
  assert.equal(
    isUserCorsOriginAllowed("/api/user/organizations", "https://evil.example", policy()),
    false
  );
});
