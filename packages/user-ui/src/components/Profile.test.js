import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Profile.tsx"), "utf8");
const apiSource = readFileSync(resolve(here, "../services/api.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../App.tsx"), "utf8");

test("profile supports self-service name and email management", () => {
  assert.notEqual(source.indexOf("apiService.getProfile"), -1);
  assert.notEqual(source.indexOf("apiService.updateProfile"), -1);
  assert.notEqual(source.indexOf("apiService.requestEmailChange"), -1);
  assert.notEqual(source.indexOf("apiService.resendPendingEmailChange"), -1);
  assert.notEqual(source.indexOf("apiService.cancelPendingEmailChange"), -1);
  assert.notEqual(source.indexOf("Send verification"), -1);
  assert.notEqual(source.indexOf("Pending email"), -1);
  assert.notEqual(source.indexOf("Cancel pending"), -1);
  assert.notEqual(source.indexOf("current sign-in email"), -1);
});

test("profile API client matches account details endpoints", () => {
  assert.notEqual(apiSource.indexOf("interface UserProfile"), -1);
  assert.notEqual(apiSource.indexOf('return this.request("/profile")'), -1);
  assert.notEqual(apiSource.indexOf('return this.request("/profile", {'), -1);
  assert.notEqual(apiSource.indexOf('return this.request("/profile/email", {'), -1);
  assert.notEqual(apiSource.indexOf('return this.request("/profile/email/resend"'), -1);
  assert.notEqual(apiSource.indexOf('return this.request("/profile/email/pending"'), -1);
});

test("profile changes can refresh the portal header session state", () => {
  assert.notEqual(appSource.indexOf("updateSessionProfile"), -1);
  assert.notEqual(appSource.indexOf("onProfileChanged={updateSessionProfile}"), -1);
  assert.notEqual(source.indexOf("onProfileChanged"), -1);
});

test("profile keeps organization create, hosted switch, and detail entry points", () => {
  assert.notEqual(source.indexOf(".getOrganizations"), -1);
  assert.notEqual(source.indexOf("apiService.createOrganization"), -1);
  assert.notEqual(source.indexOf("apiService.setSessionOrganization"), -1);
  assert.notEqual(
    source.indexOf("const canSwitchOrganizations = activeOrganizations.length > 1"),
    -1
  );
  assert.notEqual(source.indexOf('navigate("/switch-org")'), -1);
  assert.notEqual(source.indexOf("{canSwitchOrganizations ?"), -1);
  assert.notEqual(source.indexOf("/organizations/${encodeURIComponent"), -1);
});

test("profile and portal show the current active organization", () => {
  assert.notEqual(source.indexOf("Active organization"), -1);
  assert.notEqual(source.indexOf('<StatusPill tone="ready">Current</StatusPill>'), -1);
  assert.notEqual(source.indexOf("organizationLabel={organizationLabel}"), -1);
  assert.notEqual(appSource.indexOf("organizationSlug: session.organizationSlug"), -1);
});
