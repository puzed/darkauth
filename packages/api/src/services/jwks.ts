import { eq } from "drizzle-orm";
import {
  type CryptoKey,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  type KeyObject,
  SignJWT,
} from "jose";
import { jwks } from "../db/schema.js";
import type { Context, JWK, JWTPayload } from "../types.js";
import { generateRandomString } from "../utils/crypto.js";

export async function generateEdDSAKeyPair(): Promise<{
  publicJwk: JWK;
  privateJwk: JWK;
  kid: string;
}> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });

  const kid = generateRandomString(16);
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);

  publicJwk.kid = kid;
  publicJwk.alg = "EdDSA";
  publicJwk.use = "sig";

  privateJwk.kid = kid;
  privateJwk.alg = "EdDSA";
  privateJwk.use = "sig";

  return { publicJwk: publicJwk as JWK, privateJwk: privateJwk as JWK, kid };
}

export async function storeKeyPair(
  context: Context,
  kid: string,
  publicJwk: JWK,
  privateJwk: JWK,
  alg = "EdDSA"
): Promise<void> {
  let privateJwkEnc: Buffer | null = null;

  if (context.services.kek?.isAvailable()) {
    const privateJwkJson = JSON.stringify(privateJwk);
    privateJwkEnc = await context.services.kek.encrypt(Buffer.from(privateJwkJson));
  } else if (!context.config.insecureKeys) {
    throw new Error("KEK service not available and insecure keys not allowed");
  }

  await context.db.insert(jwks).values({
    kid,
    alg,
    publicJwk,
    privateJwkEnc,
    createdAt: new Date(),
  });
}

export async function getPrivateKey(context: Context, kid: string): Promise<JWK | null> {
  const key = await context.db.query.jwks.findFirst({
    where: eq(jwks.kid, kid),
  });

  if (!key) return null;

  if (key.privateJwkEnc) {
    if (!context.services.kek?.isAvailable()) {
      throw new Error("KEK service not available to decrypt private key");
    }

    const decrypted = await context.services.kek.decrypt(key.privateJwkEnc);
    return JSON.parse(decrypted.toString()) as JWK;
  }

  if (context.config.insecureKeys) {
    const publicJwk = key.publicJwk as JWK;
    return publicJwk;
  }

  throw new Error("Private key not available");
}

export async function getPublicKeys(context: Context): Promise<JWK[]> {
  const keys = await context.db.query.jwks.findMany();
  return keys.map((key) => key.publicJwk as JWK);
}

export async function getLatestSigningKey(
  context: Context
): Promise<{ kid: string; privateKey: CryptoKey | KeyObject }> {
  const latestKey = await context.db.query.jwks.findFirst({
    orderBy: (jwks, { desc }) => [desc(jwks.createdAt)],
  });

  if (!latestKey) {
    throw new Error("No signing keys available");
  }

  const privateJwk = await getPrivateKey(context, latestKey.kid);
  if (!privateJwk) {
    throw new Error("Private key not available");
  }

  const privateKey = (await importJWK(privateJwk, "EdDSA")) as unknown as CryptoKey | KeyObject;

  return { kid: latestKey.kid, privateKey };
}

export async function signJWT(
  context: Context,
  payload: JWTPayload,
  expiresIn = "5m"
): Promise<string> {
  const { kid, privateKey } = await getLatestSigningKey(context);

  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuedAt()
    .setJti(generateRandomString(32))
    .setExpirationTime(expiresIn)
    .setIssuer(context.config.issuer);

  // Set audience if provided in payload
  if (payload.aud) {
    jwt.setAudience(payload.aud);
  }

  return await jwt.sign(privateKey);
}

export async function verifyJWT(
  context: Context,
  token: string,
  expectedAudience?: string | string[]
): Promise<JWTPayload> {
  const publicKeys = await getPublicKeys(context);

  for (const jwk of publicKeys) {
    try {
      const publicKey = await importJWK(jwk, "EdDSA");
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: context.config.issuer,
        audience: expectedAudience,
      });
      return payload;
    } catch {
      // Continue to next key
    }
  }

  throw new Error("Invalid JWT signature");
}

export async function rotateKeys(context: Context): Promise<{ kid: string }> {
  const previous = await context.db.query.jwks.findFirst({
    orderBy: (jwks, { desc }) => [desc(jwks.createdAt)],
  });

  const { publicJwk, privateJwk, kid } = await generateEdDSAKeyPair();
  await storeKeyPair(context, kid, publicJwk, privateJwk);

  if (previous) {
    await context.db.update(jwks).set({ rotatedAt: new Date() }).where(eq(jwks.kid, previous.kid));
  }

  return { kid };
}
