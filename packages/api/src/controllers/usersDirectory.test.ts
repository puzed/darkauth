import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasRequiredPermission,
  hasRequiredScope,
  resolveUsersReadModeFromPayload,
} from "./user/usersDirectory.js";

test("hasRequiredPermission returns true when permission is present", () => {
  assert.equal(hasRequiredPermission(["darkauth.users:read"]), true);
});

test("hasRequiredPermission returns false for non-array claims", () => {
  assert.equal(hasRequiredPermission("darkauth.users:read"), false);
});

test("hasRequiredScope supports space-delimited scope claim strings", () => {
  assert.equal(hasRequiredScope("openid darkauth.users:read profile"), true);
});

test("resolveUsersReadModeFromPayload returns null for permission-only claims", () => {
  const mode = resolveUsersReadModeFromPayload({ permissions: ["darkauth.users:read"] });
  assert.equal(mode, null);
});

test("resolveUsersReadModeFromPayload returns management for access token client_credentials scope", () => {
  const mode = resolveUsersReadModeFromPayload({
    token_use: "access",
    grant_type: "client_credentials",
    scope: "darkauth.users:read",
  });
  assert.equal(mode, "management");
});

test("resolveUsersReadModeFromPayload returns null when missing required permission/scope", () => {
  const mode = resolveUsersReadModeFromPayload({
    grant_type: "client_credentials",
    scope: "openid",
  });
  assert.equal(mode, null);
});
