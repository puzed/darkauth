import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClientScopeDefinitions } from "../utils/clientScopes.ts";
import { buildDefaultClientSeeds } from "./install.ts";

test("buildDefaultClientSeeds includes structured scope definitions", () => {
  const demoSecret = Buffer.from("demo-secret");
  const seeds = buildDefaultClientSeeds(demoSecret, "https://auth.example.com");

  assert.equal(seeds.length, 3);
  assert.equal(seeds[0]?.clientId, "user");
  assert.equal(seeds[1]?.clientId, "demo-public-client");
  assert.equal(seeds[2]?.clientId, "demo-confidential-client");
  assert.equal(seeds[2]?.clientSecretEnc, demoSecret);

  const userScopes = parseClientScopeDefinitions(seeds[0]?.scopes ?? []);
  const publicScopes = parseClientScopeDefinitions(seeds[1]?.scopes ?? []);
  const confidentialScopes = parseClientScopeDefinitions(seeds[2]?.scopes ?? []);

  assert.deepEqual(userScopes, [
    { key: "openid", description: "Authenticate you" },
    { key: "profile", description: "Access your profile information" },
    { key: "email", description: "Access your email address" },
  ]);
  assert.deepEqual(publicScopes, [
    { key: "openid", description: "Authenticate you" },
    { key: "profile", description: "Access your profile information" },
    { key: "email", description: "Access your email address" },
  ]);
  assert.deepEqual(confidentialScopes, [
    { key: "openid", description: "Authenticate you" },
    { key: "profile", description: "Access your profile information" },
    { key: "darkauth.users:read", description: "Search and read users from the directory" },
  ]);
});
