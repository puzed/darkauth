import { ValidationError } from "../errors.ts";
import { constantTimeCompare, sha256Base64Url } from "./crypto.ts";

export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method = "S256"
): boolean {
  if (method !== "S256") {
    throw new ValidationError("Only S256 code challenge method is supported");
  }

  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) {
    throw new ValidationError("Invalid code verifier length");
  }

  const expectedChallenge = sha256Base64Url(codeVerifier);
  return constantTimeCompare(expectedChallenge, codeChallenge);
}

export function validateCodeChallenge(codeChallenge: string, method = "S256"): void {
  if (!codeChallenge) {
    throw new ValidationError("Code challenge is required");
  }

  if (method !== "S256") {
    throw new ValidationError("Only S256 code challenge method is supported");
  }

  if (codeChallenge.length < 43 || codeChallenge.length > 128) {
    throw new ValidationError("Invalid code challenge length");
  }

  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(codeChallenge)) {
    throw new ValidationError("Invalid code challenge format");
  }
}
