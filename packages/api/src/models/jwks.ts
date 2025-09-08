import { eq } from "drizzle-orm";
import { jwks } from "../db/schema.js";
import { ValidationError, NotFoundError } from "../errors.js";
import type { Context } from "../types.js";

export interface JWKSKey {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  key: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface JWKSResponse {
  keys: Array<{
    kid: string;
    kty: string;
    use: string;
    alg: string;
    n?: string;
    e?: string;
    x?: string;
    y?: string;
    crv?: string;
  }>;
}

/**
 * Gets all active JWKS keys for public consumption
 */
export async function getPublicJWKS(context: Context): Promise<JWKSResponse> {
  const activeKeys = await context.db.query.jwks.findMany({
    where: eq(jwks.isActive, true),
  });

  const keys = activeKeys
    .filter(key => !key.expiresAt || key.expiresAt > new Date())
    .map(key => {
      try {
        const keyData = JSON.parse(key.key);
        return {
          kid: key.kid,
          kty: key.kty,
          use: key.use,
          alg: key.alg,
          ...keyData,
        };
      } catch (error) {
        console.error(`Failed to parse key ${key.kid}:`, error);
        return null;
      }
    })
    .filter(Boolean);

  return { keys };
}

/**
 * Gets a specific JWKS key by kid for signing operations
 */
export async function getJWKSKey(context: Context, kid: string): Promise<JWKSKey | null> {
  const key = await context.db.query.jwks.findFirst({
    where: eq(jwks.kid, kid),
  });

  if (!key) {
    return null;
  }

  // Check if key has expired
  if (key.expiresAt && key.expiresAt <= new Date()) {
    return null;
  }

  return {
    kid: key.kid,
    kty: key.kty,
    use: key.use,
    alg: key.alg,
    key: key.key,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
  };
}

/**
 * Gets the current active signing key
 */
export async function getCurrentSigningKey(context: Context): Promise<JWKSKey | null> {
  const activeKeys = await context.db.query.jwks.findMany({
    where: eq(jwks.isActive, true),
  });

  // Find the most recent active key that hasn't expired
  const validKeys = activeKeys
    .filter(key => !key.expiresAt || key.expiresAt > new Date())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (validKeys.length === 0) {
    return null;
  }

  const key = validKeys[0];

  return {
    kid: key.kid,
    kty: key.kty,
    use: key.use,
    alg: key.alg,
    key: key.key,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
  };
}

/**
 * Creates a new JWKS key
 */
export async function createJWKSKey(
  context: Context,
  keyData: {
    kid: string;
    kty: string;
    use: string;
    alg: string;
    key: string;
    expiresAt?: Date;
    isActive?: boolean;
  }
): Promise<JWKSKey> {
  // Validate key data
  validateJWKSKeyData(keyData);

  // Check if kid already exists
  const existing = await context.db.query.jwks.findFirst({
    where: eq(jwks.kid, keyData.kid),
  });

  if (existing) {
    throw new ValidationError("Key ID already exists");
  }

  // Create key
  await context.db.insert(jwks).values({
    kid: keyData.kid,
    kty: keyData.kty,
    use: keyData.use,
    alg: keyData.alg,
    key: keyData.key,
    createdAt: new Date(),
    expiresAt: keyData.expiresAt,
    isActive: keyData.isActive !== false,
  });

  return {
    kid: keyData.kid,
    kty: keyData.kty,
    use: keyData.use,
    alg: keyData.alg,
    key: keyData.key,
    createdAt: new Date(),
    expiresAt: keyData.expiresAt,
    isActive: keyData.isActive !== false,
  };
}

/**
 * Rotates JWKS keys - creates a new key and marks old ones for expiration
 */
export async function rotateJWKSKeys(
  context: Context,
  options: {
    algorithm?: string;
    keySize?: number;
    gracePeriodDays?: number;
  } = {}
): Promise<{ newKey: JWKSKey; deactivatedKeys: string[] }> {
  const algorithm = options.algorithm || "RS256";
  const gracePeriodDays = options.gracePeriodDays || 30;

  // Generate new key using crypto service
  const newKeyData = await context.services.crypto.generateJWK({
    alg: algorithm,
    use: "sig",
    kty: algorithm.startsWith("RS") ? "RSA" : "EC",
  });

  // Create new key
  const kid = context.services.crypto.generateRandomString(16);
  const newKey = await createJWKSKey(context, {
    kid,
    kty: newKeyData.kty,
    use: "sig",
    alg: algorithm,
    key: JSON.stringify(newKeyData),
    isActive: true,
  });

  // Mark old keys for deactivation after grace period
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  const oldActiveKeys = await context.db.query.jwks.findMany({
    where: eq(jwks.isActive, true),
  });

  const deactivatedKeys: string[] = [];

  for (const oldKey of oldActiveKeys) {
    if (oldKey.kid !== kid) {
      await context.db
        .update(jwks)
        .set({
          expiresAt: gracePeriodEnd,
          isActive: false,
        })
        .where(eq(jwks.kid, oldKey.kid));
      
      deactivatedKeys.push(oldKey.kid);
    }
  }

  return { newKey, deactivatedKeys };
}

/**
 * Deactivates a specific key
 */
export async function deactivateJWKSKey(context: Context, kid: string): Promise<boolean> {
  const result = await context.db
    .update(jwks)
    .set({ isActive: false })
    .where(eq(jwks.kid, kid))
    .returning();

  return result.length > 0;
}

/**
 * Cleans up expired keys
 */
export async function cleanupExpiredKeys(context: Context): Promise<number> {
  const now = new Date();
  
  const result = await context.db
    .delete(jwks)
    .where(eq(jwks.expiresAt, now))
    .returning();

  return result.length;
}

/**
 * Lists all JWKS keys (for admin purposes)
 */
export async function listAllJWKSKeys(context: Context): Promise<Array<Omit<JWKSKey, 'key'>>> {
  const keys = await context.db.query.jwks.findMany();

  return keys.map(key => ({
    kid: key.kid,
    kty: key.kty,
    use: key.use,
    alg: key.alg,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
  }));
}

/**
 * Validates JWKS key data
 */
function validateJWKSKeyData(keyData: {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  key: string;
}): void {
  if (!keyData.kid || keyData.kid.length === 0) {
    throw new ValidationError("Key ID is required");
  }

  if (!["RSA", "EC"].includes(keyData.kty)) {
    throw new ValidationError("Key type must be RSA or EC");
  }

  if (!["sig", "enc"].includes(keyData.use)) {
    throw new ValidationError("Key use must be 'sig' or 'enc'");
  }

  if (!keyData.alg || keyData.alg.length === 0) {
    throw new ValidationError("Algorithm is required");
  }

  if (!keyData.key || keyData.key.length === 0) {
    throw new ValidationError("Key data is required");
  }

  // Validate key is valid JSON
  try {
    JSON.parse(keyData.key);
  } catch {
    throw new ValidationError("Key must be valid JSON");
  }
}