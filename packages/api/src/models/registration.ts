import { eq } from "drizzle-orm";
import { opaqueRecords, userGroups, users } from "../db/schema.js";
import { ConflictError, ValidationError } from "../errors.js";
import { createSession } from "../services/sessions.js";
import type { Context } from "../types.js";

export async function userOpaqueRegisterFinish(
  context: Context,
  data: { record: Uint8Array; email: string; name: string }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) throw new ValidationError("Invalid email format");
  const opaqueRecord = await context.services.opaque.finishRegistration(data.record, data.email);
  const { generateRandomString } = await import("../utils/crypto.js");
  const sub = generateRandomString(16);
  await context.db.transaction(async (tx) => {
    const existingUser = await tx.query.users.findFirst({ where: eq(users.email, data.email) });
    if (existingUser) throw new ConflictError("User with this email already exists");
    await tx
      .insert(users)
      .values({ sub, email: data.email, name: data.name, createdAt: new Date() });
    await tx.insert(userGroups).values({ userSub: sub, groupKey: "default" });
    await tx.insert(opaqueRecords).values({
      sub,
      envelope: Buffer.from(opaqueRecord.envelope),
      serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
      updatedAt: new Date(),
    });
  });
  const sessionInfo = await createSession(context, "user", {
    sub,
    email: data.email,
    name: data.name,
  });
  return { sub, accessToken: sessionInfo.sessionId, refreshToken: sessionInfo.refreshToken };
}
