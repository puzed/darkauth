import { ValidationError } from "../errors.ts";

/**
 * Interface representing a P-256 ECDH public key in JWK format
 */
export interface P256PublicKeyJWK {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
  d?: unknown;
}

/**
 * Validates that a string is a valid base64url encoded value
 */
function isValidBase64Url(str: string): boolean {
  // Base64url uses A-Z, a-z, 0-9, -, and _ characters
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  return base64UrlRegex.test(str);
}

/**
 * Validates that a base64url string has the correct byte length when decoded
 * P-256 coordinates should be 32 bytes (256 bits) each
 */
function isValidP256CoordinateLength(coordinate: string): boolean {
  try {
    // Decode the base64url string to get the actual bytes
    const buffer = Buffer.from(coordinate, "base64url");
    // P-256 coordinates should be exactly 32 bytes
    return buffer.length === 32;
  } catch {
    return false;
  }
}

/**
 * Validates that a JWK object represents a valid P-256 ECDH public key
 *
 * @param jwk - The JWK object to validate (should be parsed JSON)
 * @throws {ValidationError} If the JWK is invalid
 */
export function validateP256PublicKeyJWK(jwk: unknown): asserts jwk is P256PublicKeyJWK {
  if (!jwk || typeof jwk !== "object") {
    throw new ValidationError("zk_pub must be a valid JSON object");
  }

  const key = jwk as Record<string, unknown>;

  if (Object.hasOwn(key, "d")) {
    throw new ValidationError("zk_pub must not include private key material");
  }

  // Validate required fields
  if (key.kty !== "EC") {
    throw new ValidationError("zk_pub must have kty='EC' for elliptic curve keys");
  }

  if (key.crv !== "P-256") {
    throw new ValidationError("zk_pub must have crv='P-256' for P-256 curve");
  }

  if (typeof key.x !== "string") {
    throw new ValidationError("zk_pub must have a valid 'x' coordinate as a string");
  }

  if (typeof key.y !== "string") {
    throw new ValidationError("zk_pub must have a valid 'y' coordinate as a string");
  }

  // Validate x coordinate
  if (!isValidBase64Url(key.x)) {
    throw new ValidationError("zk_pub 'x' coordinate must be valid base64url format");
  }

  if (!isValidP256CoordinateLength(key.x)) {
    throw new ValidationError("zk_pub 'x' coordinate must be 32 bytes (256 bits) for P-256");
  }

  // Validate y coordinate
  if (!isValidBase64Url(key.y)) {
    throw new ValidationError("zk_pub 'y' coordinate must be valid base64url format");
  }

  if (!isValidP256CoordinateLength(key.y)) {
    throw new ValidationError("zk_pub 'y' coordinate must be 32 bytes (256 bits) for P-256");
  }

  // Validate optional fields if present
  if (key.use !== undefined && typeof key.use !== "string") {
    throw new ValidationError("zk_pub 'use' field must be a string if present");
  }

  if (key.key_ops !== undefined) {
    if (!Array.isArray(key.key_ops) || !key.key_ops.every((op) => typeof op === "string")) {
      throw new ValidationError("zk_pub 'key_ops' field must be an array of strings if present");
    }
  }

  if (key.alg !== undefined && typeof key.alg !== "string") {
    throw new ValidationError("zk_pub 'alg' field must be a string if present");
  }

  if (key.kid !== undefined && typeof key.kid !== "string") {
    throw new ValidationError("zk_pub 'kid' field must be a string if present");
  }
}

/**
 * Parses and validates a zk_pub string parameter
 *
 * @param zkPubString - The zk_pub parameter as a string (should be JSON)
 * @returns The validated P-256 JWK object
 * @throws {ValidationError} If the string is invalid or doesn't represent a valid P-256 JWK
 */
export function parseAndValidateZkPub(zkPubString: string): P256PublicKeyJWK {
  let jwk: unknown;

  try {
    jwk = JSON.parse(zkPubString);
  } catch {
    throw new ValidationError("zk_pub must be valid JSON");
  }

  validateP256PublicKeyJWK(jwk);
  return jwk;
}
