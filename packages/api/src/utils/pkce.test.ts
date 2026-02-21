import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../errors.js";
import { sha256Base64Url } from "./crypto.js";
import { verifyCodeChallenge } from "./pkce.js";

test("verifyCodeChallenge returns true for matching verifier and challenge", () => {
  const codeVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const codeChallenge = sha256Base64Url(codeVerifier);
  assert.equal(verifyCodeChallenge(codeVerifier, codeChallenge), true);
});

test("verifyCodeChallenge returns false for non-matching verifier and challenge", () => {
  const codeVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const codeChallenge = sha256Base64Url(`${codeVerifier}different`);
  assert.equal(verifyCodeChallenge(codeVerifier, codeChallenge), false);
});

test("verifyCodeChallenge throws for invalid verifier length", () => {
  assert.throws(() => verifyCodeChallenge("short", "challenge"), ValidationError);
});
