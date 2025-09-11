import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../errors.js";
import { parseAndValidateZkPub, validateP256PublicKeyJWK } from "./jwk.js";

// Type that allows testing missing required fields by making all properties optional
type PartialJWK = {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
} & Record<string, unknown>;

// Valid P-256 public key JWK for testing
const validJWK = {
  kty: "EC",
  crv: "P-256",
  x: "6bOx7a91ig5sjhx060HPJJUPdOhA4xUXUOB3ebjRVC0",
  y: "-Z4rYu-UTSFg-QuG_eLkDSX9P1OaQtZ1j7JCdYjWi3Y",
};

// Valid JWK with all optional fields
const validJWKWithOptionals = {
  kty: "EC",
  crv: "P-256",
  x: "6bOx7a91ig5sjhx060HPJJUPdOhA4xUXUOB3ebjRVC0",
  y: "-Z4rYu-UTSFg-QuG_eLkDSX9P1OaQtZ1j7JCdYjWi3Y",
  use: "enc",
  key_ops: ["deriveKey", "deriveBits"],
  alg: "ECDH-ES",
  kid: "test-key-id",
};

test("validateP256PublicKeyJWK accepts valid P-256 JWK", () => {
  assert.doesNotThrow(() => validateP256PublicKeyJWK(validJWK));
});

test("validateP256PublicKeyJWK accepts valid JWK with optional fields", () => {
  assert.doesNotThrow(() => validateP256PublicKeyJWK(validJWKWithOptionals));
});

test("validateP256PublicKeyJWK throws for null/undefined input", () => {
  assert.throws(() => validateP256PublicKeyJWK(null), ValidationError);
  assert.throws(() => validateP256PublicKeyJWK(undefined), ValidationError);
});

test("validateP256PublicKeyJWK throws for non-object input", () => {
  assert.throws(() => validateP256PublicKeyJWK("string"), ValidationError);
  assert.throws(() => validateP256PublicKeyJWK(123), ValidationError);
  assert.throws(() => validateP256PublicKeyJWK(true), ValidationError);
});

test("validateP256PublicKeyJWK throws for missing kty field", () => {
  const jwk: PartialJWK = { ...validJWK };
  jwk.kty = undefined;
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /kty='EC'/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for wrong kty value", () => {
  const jwk = { ...validJWK, kty: "RSA" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /kty='EC'/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for missing crv field", () => {
  const jwk: PartialJWK = { ...validJWK };
  jwk.crv = undefined;
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /crv='P-256'/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for wrong crv value", () => {
  const jwk = { ...validJWK, crv: "P-384" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /crv='P-256'/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for missing x coordinate", () => {
  const jwk: PartialJWK = { ...validJWK };
  jwk.x = undefined;
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for non-string x coordinate", () => {
  const jwk = { ...validJWK, x: 123 };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for missing y coordinate", () => {
  const jwk: PartialJWK = { ...validJWK };
  jwk.y = undefined;
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'y' coordinate/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for non-string y coordinate", () => {
  const jwk = { ...validJWK, y: 123 };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'y' coordinate/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid base64url in x coordinate", () => {
  const jwk = { ...validJWK, x: "invalid+base64/chars=" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate.*base64url/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid base64url in y coordinate", () => {
  const jwk = { ...validJWK, y: "invalid+base64/chars=" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'y' coordinate.*base64url/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for wrong length x coordinate", () => {
  const jwk = { ...validJWK, x: "short" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate.*32 bytes/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for wrong length y coordinate", () => {
  const jwk = { ...validJWK, y: "short" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'y' coordinate.*32 bytes/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid optional use field", () => {
  const jwk = { ...validJWK, use: 123 };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'use' field/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid optional key_ops field", () => {
  const jwk = { ...validJWK, key_ops: "not-array" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'key_ops' field/.test(error.message);
    }
  );

  const jwk2 = { ...validJWK, key_ops: [123] };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk2),
    (error: unknown) => {
      return error instanceof ValidationError && /'key_ops' field/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid optional alg field", () => {
  const jwk = { ...validJWK, alg: 123 };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'alg' field/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK throws for invalid optional kid field", () => {
  const jwk = { ...validJWK, kid: 123 };
  assert.throws(
    () => validateP256PublicKeyJWK(jwk),
    (error: unknown) => {
      return error instanceof ValidationError && /'kid' field/.test(error.message);
    }
  );
});

test("parseAndValidateZkPub parses and validates valid JSON", () => {
  const zkPubString = JSON.stringify(validJWK);
  const result = parseAndValidateZkPub(zkPubString);
  assert.deepEqual(result, validJWK);
});

test("parseAndValidateZkPub throws for invalid JSON", () => {
  assert.throws(
    () => parseAndValidateZkPub("invalid-json"),
    (error: unknown) => {
      return error instanceof ValidationError && /valid JSON/.test(error.message);
    }
  );
  assert.throws(
    () => parseAndValidateZkPub("{invalid"),
    (error: unknown) => {
      return error instanceof ValidationError && /valid JSON/.test(error.message);
    }
  );
});

test("parseAndValidateZkPub throws for valid JSON but invalid JWK", () => {
  const invalidJWK = { kty: "RSA", n: "...", e: "AQAB" };
  const zkPubString = JSON.stringify(invalidJWK);
  assert.throws(
    () => parseAndValidateZkPub(zkPubString),
    (error: unknown) => {
      return error instanceof ValidationError && /kty='EC'/.test(error.message);
    }
  );
});

test("validateP256PublicKeyJWK rejects presence of private key component d", () => {
  const jwkWithD = { kty: "EC", crv: "P-256", x: validJWK.x, y: validJWK.y, d: "secret" };
  assert.throws(
    () => validateP256PublicKeyJWK(jwkWithD as unknown),
    (error: unknown) => {
      return error instanceof ValidationError && /must not include private key/.test(error.message);
    }
  );
});

test("parseAndValidateZkPub accepts various valid coordinate lengths", () => {
  // Test with different valid 32-byte P-256 coordinates
  const testCases = [
    // First valid key
    {
      x: "Dy6rEJw3hYzePNo7MUVGlPOSiYtUhZb22yiVTDzSeTs",
      y: "I_CogCPOhjuOusyGxJ_GulIifcRA7U90vSdcoEpNS3w",
    },
    // Second valid key
    {
      x: "Nz-1ZGF4iFlwsw24_q7um102YlrOu0MHyfBafNK1e3U",
      y: "8b27XlFZ-HwfUo3h8moqOCFC04y-iMXYeqwBooB2Dhk",
    },
  ];

  testCases.forEach((coords, index) => {
    const jwk = { ...validJWK, ...coords };
    const zkPubString = JSON.stringify(jwk);
    assert.doesNotThrow(
      () => parseAndValidateZkPub(zkPubString),
      `Test case ${index} should not throw`
    );
  });
});

test("coordinate length validation handles edge cases correctly", () => {
  // Test coordinate that's too short (31 bytes)
  const shortJWK = {
    ...validJWK,
    x: "sayULerg9hmkuenOJpxD4lLmBcOUTCpQm3GSDAwfWg", // 31 bytes
  };
  assert.throws(
    () => validateP256PublicKeyJWK(shortJWK),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate.*32 bytes/.test(error.message);
    }
  );

  // Test coordinate that's too long (33 bytes)
  const longJWK = {
    ...validJWK,
    x: "0Vd8HVxZkwv9UGO0HnsBshb23019TQDZiiYDnBQFkof4", // 33 bytes
  };
  assert.throws(
    () => validateP256PublicKeyJWK(longJWK),
    (error: unknown) => {
      return error instanceof ValidationError && /'x' coordinate.*32 bytes/.test(error.message);
    }
  );
});
