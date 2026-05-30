import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const appSource = readFileSync(resolve(root, "App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(root, "components/app-sidebar.tsx"), "utf8");
const apiSource = readFileSync(resolve(root, "services/api.ts"), "utf8");
const clientSource = readFileSync(resolve(here, "ClientEdit.tsx"), "utf8");
const federationSource = readFileSync(resolve(here, "FederationConnections.tsx"), "utf8");
const scimSource = readFileSync(resolve(here, "ScimTokens.tsx"), "utf8");
const userSource = readFileSync(resolve(here, "UserEdit.tsx"), "utf8");

test("admin routes and sidebar expose federation and SCIM token management", () => {
  assert.notEqual(appSource.indexOf('path="/federation"'), -1);
  assert.notEqual(appSource.indexOf('path="/scim"'), -1);
  assert.notEqual(sidebarSource.indexOf('url: "/federation"'), -1);
  assert.notEqual(sidebarSource.indexOf('url: "/scim"'), -1);
});

test("admin API service includes federation and SCIM token endpoints", () => {
  assert.notEqual(apiSource.indexOf("/federation/connections"), -1);
  assert.notEqual(apiSource.indexOf("/federation/oidc/discovery"), -1);
  assert.notEqual(apiSource.indexOf("/federation/domain-route"), -1);
  assert.notEqual(apiSource.indexOf("/scim/tokens"), -1);
});

test("federation page supports discovery, routing preview, mapping, and secret replacement", () => {
  assert.notEqual(federationSource.indexOf("discoverFederationOidc"), -1);
  assert.notEqual(federationSource.indexOf("previewFederationDomainRoute"), -1);
  assert.notEqual(federationSource.indexOf("replaceSecret"), -1);
  assert.notEqual(federationSource.indexOf("subjectClaim"), -1);
  assert.notEqual(federationSource.indexOf("accountLinkingPolicy"), -1);
});

test("SCIM token page shows created bearer token once and supports revoke", () => {
  assert.notEqual(scimSource.indexOf("createdToken?.token"), -1);
  assert.notEqual(scimSource.indexOf("Copy this SCIM bearer token now"), -1);
  assert.notEqual(scimSource.indexOf("revokeScimToken"), -1);
});

test("client editor exposes v2 key delivery and derived delivered key kind", () => {
  assert.notEqual(clientSource.indexOf("keyDeliveryVersion"), -1);
  assert.notEqual(clientSource.indexOf("clientKeyScope"), -1);
  assert.notEqual(clientSource.indexOf("Client Key Scope"), -1);
  assert.notEqual(clientSource.indexOf("deliveredKeyKindFor"), -1);
  assert.notEqual(clientSource.indexOf("v1-drk"), -1);
  assert.notEqual(clientSource.indexOf("client_app_key"), -1);
});

test("user detail includes key status inventory and revoke hooks", () => {
  assert.notEqual(apiSource.indexOf("/key-status"), -1);
  assert.notEqual(userSource.indexOf("Key Status"), -1);
  assert.notEqual(userSource.indexOf("revokeUserKeyEnvelope"), -1);
  assert.notEqual(userSource.indexOf("revokeUserTrustedDevice"), -1);
});

test("federation page exposes enterprise federation policy controls", () => {
  assert.notEqual(apiSource.indexOf("FederationPolicyControls"), -1);
  assert.notEqual(federationSource.indexOf("defaultFederationPolicy"), -1);
  assert.notEqual(federationSource.indexOf("JIT User Creation"), -1);
  assert.notEqual(federationSource.indexOf("SCIM Pre-provisioning"), -1);
  assert.notEqual(federationSource.indexOf("ZK Password Setup"), -1);
  assert.notEqual(federationSource.indexOf("Passkey PRF Unlock"), -1);
  assert.notEqual(federationSource.indexOf("Trusted-device Approval"), -1);
  assert.notEqual(federationSource.indexOf("Non-ZK Key Setup Bypass"), -1);
  assert.notEqual(federationSource.indexOf("darkauth_policy"), -1);
});
