import { desc } from "drizzle-orm";
import { jwks } from "../db/schema.js";
import type { Context } from "../types.js";

export async function listJwks(context: Context) {
  const jwksData = await context.db
    .select({
      kid: jwks.kid,
      alg: jwks.alg,
      publicJwk: jwks.publicJwk,
      createdAt: jwks.createdAt,
      rotatedAt: jwks.rotatedAt,
      privateJwkEnc: jwks.privateJwkEnc,
    })
    .from(jwks)
    .orderBy(desc(jwks.createdAt));
  return jwksData.map((key) => ({
    kid: key.kid,
    alg: key.alg,
    publicJwk: key.publicJwk,
    createdAt: key.createdAt,
    rotatedAt: key.rotatedAt,
    hasPrivateKey: key.privateJwkEnc !== null,
  }));
}

export async function rotateJwks(context: Context) {
  const { rotateKeys } = await import("../services/jwks.js");
  const { kid } = await rotateKeys(context);
  return { kid } as const;
}
