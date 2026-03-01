import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClientScopeDefinitions } from "../utils/clientScopes.ts";
import { buildDefaultClientSeeds } from "./install.ts";

test("buildDefaultClientSeeds includes structured scope definitions", () => {
  const demoSecret = Buffer.from("demo-secret");
  const seeds = buildDefaultClientSeeds(demoSecret);

  assert.equal(seeds.length, 2);
  assert.equal(seeds[0]?.clientId, "demo-public-client");
  assert.equal(seeds[1]?.clientId, "demo-confidential-client");
  assert.equal(seeds[1]?.clientSecretEnc, demoSecret);

  const publicScopes = parseClientScopeDefinitions(seeds[0]?.scopes ?? []);
  const confidentialScopes = parseClientScopeDefinitions(seeds[1]?.scopes ?? []);

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
