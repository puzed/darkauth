import { and, eq, ilike, or } from "drizzle-orm";
import { organizationMembers, userEncryptionKeys, users } from "../db/schema.ts";
import type { Context } from "../types.ts";

export async function getDirectoryEntry(context: Context, sub: string, organizationId?: string) {
  if (organizationId) {
    const row = await context.db
      .select({
        sub: users.sub,
        display_name: users.name,
        public_key_jwk: userEncryptionKeys.encPublicJwk,
      })
      .from(users)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.userSub, users.sub),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active")
        )
      )
      .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
      .where(eq(users.sub, sub))
      .limit(1);
    return row[0] || null;
  }

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

export async function searchDirectory(context: Context, q: string, organizationId?: string) {
  const term = `%${q}%`;

  if (organizationId) {
    const rows = await context.db
      .select({
        sub: users.sub,
        display_name: users.name,
        public_key_jwk: userEncryptionKeys.encPublicJwk,
      })
      .from(users)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.userSub, users.sub),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active")
        )
      )
      .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
      .where(or(ilike(users.name, term), ilike(users.email, term)))
      .limit(10);
    return rows;
  }

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
