import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidRequestError } from "../errors.js";
import { resolveGrantedScopes } from "./user/token.js";

test("resolveGrantedScopes returns allowed scopes when no scope is requested", () => {
  const allowed = ["darkauth.users:read", "darkauth.groups:read"];
  const granted = resolveGrantedScopes(allowed);
  assert.deepEqual(granted, allowed);
});

test("resolveGrantedScopes returns requested scopes when all are allowed", () => {
  const granted = resolveGrantedScopes(
    ["darkauth.users:read", "darkauth.groups:read"],
    "darkauth.users:read"
  );
  assert.deepEqual(granted, ["darkauth.users:read"]);
});

test("resolveGrantedScopes throws when any requested scope is not allowed", () => {
  assert.throws(
    () => resolveGrantedScopes(["darkauth.users:read"], "darkauth.users:read darkauth.admin"),
    (error: unknown) =>
      error instanceof InvalidRequestError &&
      error.message === "Requested scope is not allowed for this client"
  );
});
