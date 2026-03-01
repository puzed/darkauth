import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseClientScopeDefinitions,
  serializeClientScopeDefinitions,
} from "../utils/clientScopes.ts";

test("client scope serialization preserves structured entries", () => {
  const scopes = serializeClientScopeDefinitions([
    { key: "openid", description: "Authenticate you" },
    { key: "profile", description: "Access your profile information" },
    { key: "darkauth.users:read", description: "Search and read users from the directory" },
  ]);
  const parsedScopes = parseClientScopeDefinitions(scopes);

  assert.deepEqual(parsedScopes, [
    { key: "openid", description: "Authenticate you" },
    { key: "profile", description: "Access your profile information" },
    { key: "darkauth.users:read", description: "Search and read users from the directory" },
  ]);
});
