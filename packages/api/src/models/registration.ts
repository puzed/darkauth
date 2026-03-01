import { eq } from "drizzle-orm";
import {
  opaqueRecords,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  users,
} from "../db/schema.ts";
import { ConflictError, ValidationError } from "../errors.ts";
import { isEmailSendingAvailable } from "../services/email.ts";
import {
  sendSignupExistingAccountNotice,
  sendSignupVerification,
} from "../services/emailVerification.ts";
import { createSession } from "../services/sessions.ts";
import { getSetting } from "../services/settings.ts";
import type { Context } from "../types.ts";

export async function userOpaqueRegisterFinish(
  context: Context,
  data: { record: Uint8Array; email: string; name: string }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) throw new ValidationError("Invalid email format");
  const opaqueRecord = await context.services.opaque.finishRegistration(data.record, data.email);
  const requireEmailVerification =
    (await getSetting(context, "users.require_email_verification")) === true;
  const preventEmailEnumeration =
    (await getSetting(context, "users.prevent_email_enumeration_on_registration")) === true;
  const { generateRandomString } = await import("../utils/crypto.ts");
  const sub = generateRandomString(16);
  const existingUser = await context.db.query.users.findFirst({
    where: eq(users.email, data.email),
  });
  if (existingUser) {
    const emailSendingAvailable = await isEmailSendingAvailable(context);
    if (preventEmailEnumeration && requireEmailVerification && emailSendingAvailable) {
      try {
        await sendSignupExistingAccountNotice(context, {
          email: data.email,
          name: existingUser.name || data.name,
        });
      } catch (error) {
        context.logger.warn(error, "Failed to send existing-account signup notice");
        throw new ConflictError("A user with this email address already exists");
      }
      return { sub, requiresEmailVerification: true };
    }
    throw new ConflictError("A user with this email address already exists");
  }

  await context.db.transaction(async (tx) => {
    await tx.insert(users).values({
      sub,
      email: data.email,
      name: data.name,
      emailVerifiedAt: requireEmailVerification ? null : new Date(),
      createdAt: new Date(),
    });
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
  if (requireEmailVerification) {
    await sendSignupVerification(context, {
      userSub: sub,
      email: data.email,
      name: data.name,
    });
    return { sub, requiresEmailVerification: true };
  }

  const uiUserSettings = (await getSetting(context, "ui_user")) as
    | { clientId?: string }
    | undefined
    | null;
  const userClientId =
    typeof uiUserSettings?.clientId === "string" && uiUserSettings.clientId.length > 0
      ? uiUserSettings.clientId
      : "user";
  const sessionInfo = await createSession(context, "user", {
    sub,
    email: data.email,
    name: data.name,
    clientId: userClientId,
  });
  return {
    sub,
    sessionId: sessionInfo.sessionId,
    refreshToken: sessionInfo.refreshToken,
    requiresEmailVerification: false,
  };
}
