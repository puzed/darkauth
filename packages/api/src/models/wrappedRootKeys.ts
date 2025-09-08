import { eq } from "drizzle-orm";
import { wrappedRootKeys } from "../db/schema.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function getWrappedDrk(context: Context, sub: string) {
  const row = await context.db.query.wrappedRootKeys.findFirst({
    where: eq(wrappedRootKeys.sub, sub),
  });
  if (!row) throw new NotFoundError("Not found");
  return row.wrappedDrk;
}

export async function setWrappedDrk(context: Context, sub: string, wrappedDrk: Buffer) {
  if (!sub) throw new ValidationError("User sub is required");
  if (!wrappedDrk) throw new ValidationError("wrappedDrk required");
  const now = new Date();
  await context.db
    .insert(wrappedRootKeys)
    .values({ sub, wrappedDrk, updatedAt: now })
    .onConflictDoUpdate({ target: wrappedRootKeys.sub, set: { wrappedDrk, updatedAt: now } });
  return { success: true } as const;
}
