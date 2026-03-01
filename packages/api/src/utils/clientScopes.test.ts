import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseClientScopeDefinitions,
  resolveClientScopeDescriptions,
  resolveClientScopeKeys,
  serializeClientScopeDefinitions,
} from "./clientScopes.ts";

test("parseClientScopeDefinitions normalizes, deduplicates, and ignores invalid entries", () => {
  const parsed = parseClientScopeDefinitions([
    " openid ",
    "openid",
    '{"key":"profile","description":" Profile information "}',
    { key: "email", description: " Email address " },
    { key: "custom", description: 123 },
    "{not-json",
    "   ",
    { key: "" },
    null,
  ]);

  assert.deepEqual(parsed, [
    { key: "openid" },
    { key: "profile", description: "Profile information" },
    { key: "email", description: "Email address" },
    { key: "custom" },
    { key: "{not-json" },
  ]);
});

test("serializeClientScopeDefinitions outputs compact scope strings", () => {
  const serialized = serializeClientScopeDefinitions([
    { key: "openid", description: " Authenticate you " },
    "profile",
    '{"key":"email","description":" Access your email "}',
    "profile",
  ]);

  assert.deepEqual(serialized, [
    '{"key":"openid","description":"Authenticate you"}',
    "profile",
    '{"key":"email","description":"Access your email"}',
  ]);
});

test("resolveClientScopeKeys returns normalized scope keys", () => {
  const keys = resolveClientScopeKeys([
    "openid",
    { key: "profile", description: "Profile" },
    '{"key":"email","description":"Email"}',
  ]);

  assert.deepEqual(keys, ["openid", "profile", "email"]);
});

test("resolveClientScopeDescriptions includes requested scopes with descriptions", () => {
  const descriptions = resolveClientScopeDescriptions(
    [
      { key: "openid", description: "Authenticate you" },
      { key: "profile", description: "Access profile" },
      "email",
      '{"key":"custom","description":"Custom scope"}',
    ],
    ["profile", "email", "custom"]
  );

  assert.deepEqual(descriptions, {
    profile: "Access profile",
    custom: "Custom scope",
  });
});
