import { asc, count, desc, ilike, or } from "drizzle-orm";
import { jwks } from "../db/schema.js";
import type { Context } from "../types.js";

export async function listJwks(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: "createdAt" | "kid" | "alg" | "rotatedAt";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn =
    sortBy === "kid"
      ? jwks.kid
      : sortBy === "alg"
        ? jwks.alg
        : sortBy === "rotatedAt"
          ? jwks.rotatedAt
          : jwks.createdAt;
  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const searchCondition = searchTerm
    ? or(ilike(jwks.kid, searchTerm), ilike(jwks.alg, searchTerm))
    : undefined;

  const totalRows = await (searchCondition
    ? context.db.select({ count: count() }).from(jwks).where(searchCondition)
    : context.db.select({ count: count() }).from(jwks));
  const total = totalRows[0]?.count || 0;

  const jwksData = await (searchCondition
    ? context.db
        .select({
          kid: jwks.kid,
          alg: jwks.alg,
          publicJwk: jwks.publicJwk,
          createdAt: jwks.createdAt,
          rotatedAt: jwks.rotatedAt,
          privateJwkEnc: jwks.privateJwkEnc,
        })
        .from(jwks)
        .where(searchCondition)
    : context.db
        .select({
          kid: jwks.kid,
          alg: jwks.alg,
          publicJwk: jwks.publicJwk,
          createdAt: jwks.createdAt,
          rotatedAt: jwks.rotatedAt,
          privateJwkEnc: jwks.privateJwkEnc,
        })
        .from(jwks)
  )
    .orderBy(sortFn(sortColumn), sortFn(jwks.kid))
    .limit(limit)
    .offset(offset);

  const totalPages = Math.ceil(total / limit);
  return {
    keys: jwksData.map((key) => ({
      kid: key.kid,
      alg: key.alg,
      publicJwk: key.publicJwk,
      createdAt: key.createdAt,
      rotatedAt: key.rotatedAt,
      hasPrivateKey: key.privateJwkEnc !== null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function rotateJwks(context: Context) {
  const { rotateKeys } = await import("../services/jwks.js");
  const { kid } = await rotateKeys(context);
  return { kid } as const;
}
