import * as assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Base64Url } from "../utils/crypto.js";
import { createZkPubKid, parseZkPub } from "./zkDelivery.js";

const validJwk = {
  kty: "EC" as const,
  crv: "P-256" as const,
  x: "6bOx7a91ig5sjhx060HPJJUPdOhA4xUXUOB3ebjRVC0",
  y: "-Z4rYu-UTSFg-QuG_eLkDSX9P1OaQtZ1j7JCdYjWi3Y",
};

test("parseZkPub accepts base64url(JSON JWK)", () => {
  const param = Buffer.from(JSON.stringify(validJwk)).toString("base64url");
  const parsed = parseZkPub(param);
  assert.equal(parsed.kty, "EC");
  assert.equal(parsed.crv, "P-256");
  assert.equal(parsed.x, validJwk.x);
  assert.equal(parsed.y, validJwk.y);
});

test("parseZkPub rejects invalid base64url input", () => {
  assert.throws(() => parseZkPub("not-base64url=="));
});

test("createZkPubKid binds exact string", () => {
  const s = Buffer.from(JSON.stringify(validJwk)).toString("base64url");
  assert.equal(createZkPubKid(s), sha256Base64Url(s));
});
