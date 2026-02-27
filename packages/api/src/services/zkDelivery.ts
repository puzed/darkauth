import { createPublicKey } from "node:crypto";
import { EncryptJWT, generateKeyPair, importJWK, type JWK, jwtDecrypt } from "jose";
import { ValidationError } from "../errors.js";
import { fromBase64Url, sha256 } from "../utils/crypto.js";

// Interface for JWE header structure
interface JweHeader {
  alg: string;
  enc: string;
  typ?: string;
}

// Interface for DRK JWE payload
interface DrkPayload {
  drk: string;
  sub: string;
  client_id: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

// Type guard for JweHeader
function isJweHeader(obj: unknown): obj is JweHeader {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as JweHeader).alg === "string" &&
    typeof (obj as JweHeader).enc === "string"
  );
}

// Type guard for DrkPayload
function isDrkPayload(obj: unknown): obj is DrkPayload {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as DrkPayload).drk === "string" &&
    typeof (obj as DrkPayload).sub === "string" &&
    typeof (obj as DrkPayload).client_id === "string"
  );
}

// Type guard for EC JWK (more specific than the generic JWK type)
interface ECJWKPublic extends JWK {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

interface ECJWKPrivate extends ECJWKPublic {
  d: string;
}

// Type guard for EC public key
function isECPublicKey(jwk: unknown): jwk is ECJWKPublic {
  return (
    typeof jwk === "object" &&
    jwk !== null &&
    (jwk as ECJWKPublic).kty === "EC" &&
    (jwk as ECJWKPublic).crv === "P-256" &&
    typeof (jwk as ECJWKPublic).x === "string" &&
    typeof (jwk as ECJWKPublic).y === "string" &&
    !(jwk as ECJWKPrivate).d // Public key shouldn't have private component
  );
}

// Type guard for EC private key
function isECPrivateKey(jwk: unknown): jwk is ECJWKPrivate {
  return (
    typeof jwk === "object" &&
    jwk !== null &&
    (jwk as ECJWKPrivate).kty === "EC" &&
    (jwk as ECJWKPrivate).crv === "P-256" &&
    typeof (jwk as ECJWKPrivate).x === "string" &&
    typeof (jwk as ECJWKPrivate).y === "string" &&
    typeof (jwk as ECJWKPrivate).d === "string"
  );
}

/**
 * Creates a JWE for DRK delivery using ECDH-ES + A256GCM encryption.
 *
 * @param drk - The Data Root Key as a Buffer
 * @param recipientPublicKey - The recipient's P-256 public key as JWK
 * @param sub - The subject (user identifier)
 * @param clientId - The client identifier for AAD
 * @returns Promise<string> - The JWE compact serialization
 */
export async function createDrkJwe(
  drk: Buffer,
  recipientPublicKey: ECJWKPublic,
  sub: string,
  clientId: string
): Promise<string> {
  try {
    // Import the recipient's public key (validation handled by typing)
    const recipientKey = await importJWK(recipientPublicKey, "ECDH-ES");

    // Create JWE using ECDH-ES key agreement with A256GCM content encryption
    const jwe = await new EncryptJWT({
      drk: drk.toString("base64url"), // Payload contains the DRK
      sub,
      client_id: clientId, // Include in payload for verification
    })
      .setProtectedHeader({
        alg: "ECDH-ES", // Key Management Algorithm
        enc: "A256GCM", // Content Encryption Algorithm
        typ: "JWE",
      })
      .setAudience(clientId)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("15m") // DRK JWE expires in 15 minutes
      .encrypt(recipientKey);

    return jwe;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new ValidationError(`Failed to create DRK JWE: ${errorMessage}`);
  }
}

/**
 * Verifies a JWE format and extracts its components for validation.
 * Note: This doesn't decrypt the JWE, just validates its structure.
 *
 * @param jwe - The JWE compact serialization string
 * @returns Object containing the JWE components
 */
export function verifyJweFormat(jwe: string): {
  header: JweHeader;
  encryptedKey: string;
  iv: string;
  ciphertext: string;
  tag: string;
} {
  try {
    // JWE compact serialization has 5 parts separated by dots
    const parts = jwe.split(".");

    if (parts.length !== 5) {
      throw new ValidationError("Invalid JWE format: must have 5 parts");
    }

    const [headerPart, encryptedKey, iv, ciphertext, tag] = parts;

    if (!headerPart) {
      throw new ValidationError("Invalid JWE format: missing header part");
    }

    // Decode and validate the header
    let parsedHeader: unknown;
    try {
      const headerJson = Buffer.from(headerPart, "base64url").toString("utf8");
      parsedHeader = JSON.parse(headerJson);
    } catch (_error) {
      throw new ValidationError("Invalid JWE header: not valid JSON");
    }

    // Validate header structure using type guard
    if (!isJweHeader(parsedHeader)) {
      throw new ValidationError("JWE header missing required fields (alg, enc)");
    }

    const header = parsedHeader;

    if (header.alg !== "ECDH-ES") {
      throw new ValidationError(`Unsupported JWE algorithm: ${header.alg}`);
    }

    if (header.enc !== "A256GCM") {
      throw new ValidationError(`Unsupported JWE encryption: ${header.enc}`);
    }

    // Validate base64url encoding of all parts
    try {
      if (encryptedKey) Buffer.from(encryptedKey, "base64url");
      if (iv) Buffer.from(iv, "base64url");
      if (ciphertext) Buffer.from(ciphertext, "base64url");
      if (tag) Buffer.from(tag, "base64url");
    } catch (_error) {
      throw new ValidationError("Invalid JWE: parts not properly base64url encoded");
    }

    return {
      header,
      encryptedKey: encryptedKey || "",
      iv: iv || "",
      ciphertext: ciphertext || "",
      tag: tag || "",
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new ValidationError(`JWE format verification failed: ${errorMessage}`);
  }
}

/**
 * Decrypts a DRK JWE using the recipient's private key.
 *
 * @param jwe - The JWE compact serialization string
 * @param recipientPrivateKey - The recipient's P-256 private key as JWK
 * @param expectedSub - Expected subject for validation
 * @param expectedClientId - Expected client ID for validation
 * @returns Promise<Buffer> - The decrypted DRK
 */
export async function decryptDrkJwe(
  jwe: string,
  recipientPrivateKey: ECJWKPrivate,
  expectedSub: string,
  expectedClientId: string
): Promise<Buffer> {
  try {
    // First verify the JWE format
    verifyJweFormat(jwe);

    // Import the recipient's private key (validation handled by typing)
    const recipientKey = await importJWK(recipientPrivateKey, "ECDH-ES");

    // Decrypt the JWE
    const { payload: rawPayload } = await jwtDecrypt(jwe, recipientKey);

    // Validate payload structure using type guard
    if (!isDrkPayload(rawPayload)) {
      throw new ValidationError("JWE payload missing required fields (drk, sub, client_id)");
    }

    const payload = rawPayload;

    // Validate claims
    if (payload.sub !== expectedSub) {
      throw new ValidationError("JWE subject mismatch");
    }

    if (payload.aud !== expectedClientId) {
      throw new ValidationError("JWE audience mismatch");
    }

    if (payload.client_id !== expectedClientId) {
      throw new ValidationError("JWE client_id mismatch");
    }

    // Decode the DRK from base64url
    const drkBuffer = Buffer.from(payload.drk, "base64url");

    return drkBuffer;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new ValidationError(`Failed to decrypt DRK JWE: ${errorMessage}`);
  }
}

/**
 * Utility function to validate a P-256 public key JWK.
 *
 * @param jwk - The JWK to validate
 * @returns boolean - True if valid P-256 public key
 */
export function isValidP256PublicKey(jwk: unknown): jwk is ECJWKPublic {
  try {
    return isECPublicKey(jwk);
  } catch {
    return false;
  }
}

/**
 * Utility function to validate a P-256 private key JWK.
 *
 * @param jwk - The JWK to validate
 * @returns boolean - True if valid P-256 private key
 */
export function isValidP256PrivateKey(jwk: unknown): jwk is ECJWKPrivate {
  try {
    return isECPrivateKey(jwk);
  } catch {
    return false;
  }
}

/**
 * Parse zk_pub parameter from base64url(JSON.stringify(JWK))
 * As specified in CORE.md: "zk_pub is strictly base64url(JSON.stringify(JWK))"
 */
export function parseZkPub(zkPubParam: string): ECJWKPublic {
  try {
    const decoded = fromBase64Url(zkPubParam).toString("utf8");
    const jwk = JSON.parse(decoded);

    if (!isECPublicKey(jwk)) {
      throw new ValidationError("Invalid zk_pub JWK format - must be P-256 public key");
    }

    // Ensure key is cryptographically valid and importable on the expected curve.
    createPublicKey({ key: jwk, format: "jwk" });

    return jwk;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    const e = error as { message?: string };
    throw new ValidationError(`Invalid zk_pub parameter: ${e.message || "unknown"}`);
  }
}

/**
 * Create zk_pub_kid = SHA-256(zk_pub) over the exact base64url string received
 * As specified: "server computes zk_pub_kid = SHA-256(zk_pub) over the exact base64url string"
 */
export function createZkPubKid(zkPubParam: string): string {
  return sha256(zkPubParam).toString("base64url");
}

/**
 * Compute drk_hash = base64url(SHA-256(drk_jwe)) for binding code to JWE
 */
export function computeDrkHash(drkJwe: string): string {
  return sha256(drkJwe).toString("base64url");
}

/**
 * Generate ephemeral ECDH P-256 keypair for client-side ZK delivery
 */
export async function generateEphemeralKeyPair(): Promise<{
  publicJwk: ECJWKPublic;
  privateKey: import("jose").CryptoKey;
}> {
  const { publicKey, privateKey } = await generateKeyPair("ECDH-ES", {
    crv: "P-256",
  });

  const publicJwk = (await crypto.subtle.exportKey("jwk", publicKey)) as JWK;

  // Ensure proper JWK structure for P-256 ECDH
  const ecPublicJwk: ECJWKPublic = {
    kty: "EC",
    crv: "P-256",
    x: (() => {
      const x = (publicJwk as { x?: string }).x;
      if (!x) throw new Error("Invalid exported EC public key: missing x");
      return x;
    })(),
    y: (() => {
      const y = (publicJwk as { y?: string }).y;
      if (!y) throw new Error("Invalid exported EC public key: missing y");
      return y;
    })(),
    use: "enc",
    alg: "ECDH-ES",
  };

  if (!isECPublicKey(ecPublicJwk)) {
    throw new Error("Failed to generate valid P-256 public key");
  }

  return { publicJwk: ecPublicJwk, privateKey };
}
