import { eq } from "drizzle-orm";
import {
  opaqueRecords,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  userGroups,
  users,
} from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import { createSession } from "../services/sessions.ts";
import type { Context } from "../types.ts";

export async function userOpaqueRegisterFinish(
  context: Context,
  data: { record: Uint8Array; email: string; name: string }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) throw new ValidationError("Invalid email format");
  const opaqueRecord = await context.services.opaque.finishRegistration(data.record, data.email);
  const { generateRandomString } = await import("../utils/crypto.ts");
  const sub = generateRandomString(16);
  // Check if user already exists before transaction
  // Return a generic success response to prevent user enumeration attacks
  const existingUser = await context.db.query.users.findFirst({
    where: eq(users.email, data.email),
  });
  if (existingUser) {
    // Return a fake success response without modifying existing user data
    // This prevents attackers from discovering which emails are registered
    const { generateRandomString: genFakeId } = await import("../utils/crypto.ts");
    return {
      sub: genFakeId(16),
      sessionId: genFakeId(32),
      refreshToken: genFakeId(64),
    };
  }

  await context.db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ sub, email: data.email, name: data.name, createdAt: new Date() });
    await tx.insert(userGroups).values({ userSub: sub, groupKey: "default" }).onConflictDoNothing();
    const defaultOrg = await tx.query.organizations.findFirst({
      where: eq(organizations.slug, "default"),
    });
    if (defaultOrg) {
      const [membership] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: defaultOrg.id,
          userSub: sub,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      const memberRole = await tx.query.roles.findFirst({ where: eq(roles.key, "member") });
      if (membership && memberRole) {
        await tx
          .insert(organizationMemberRoles)
          .values({ organizationMemberId: membership.id, roleId: memberRole.id })
          .onConflictDoNothing();
      }
    }
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
    clientId: "demo-public-client",
  });
  return { sub, sessionId: sessionInfo.sessionId, refreshToken: sessionInfo.refreshToken };
}
