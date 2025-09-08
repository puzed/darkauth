import { eq, ilike, or } from "drizzle-orm";
import { userEncryptionKeys, users } from "../db/schema.js";
import type { Context } from "../types.js";

export async function getDirectoryEntry(context: Context, sub: string) {
  const row = await context.db
    .select({
      sub: users.sub,
      display_name: users.name,
      public_key_jwk: userEncryptionKeys.encPublicJwk,
    })
    .from(users)
    .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
    .where(eq(users.sub, sub))
    .limit(1);
  return row[0] || null;
}

export async function searchDirectory(context: Context, q: string) {
  const term = `%${q}%`;
  const rows = await context.db
    .select({
      sub: users.sub,
      display_name: users.name,
      public_key_jwk: userEncryptionKeys.encPublicJwk,
    })
    .from(users)
    .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
    .where(or(ilike(users.name, term), ilike(users.email, term)))
    .limit(10);
  return rows;
}
