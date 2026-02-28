import { eq } from "drizzle-orm";
import {
  opaqueRecords,
  userOpaqueRecordHistory,
  userPasswordHistory,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import { verifyJWT } from "../services/jwks.ts";
import type { Context } from "../types.ts";

export async function userPasswordChangeFinish(
  context: Context,
  params: {
    userSub: string;
    email: string;
    recordBuffer: Uint8Array;
    exportKeyHash: string;
    reauthToken: string;
  }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const anyMatch = await context.db.query.userPasswordHistory.findFirst({
    where: (_fields, operators) =>
      operators.and(
        operators.eq(userPasswordHistory.userSub, params.userSub),
        operators.eq(userPasswordHistory.exportKeyHash, params.exportKeyHash)
      ),
  });
  if (anyMatch) throw new ConflictError("Password reuse not allowed");
  try {
    const payload = (await verifyJWT(context, params.reauthToken)) as import("jose").JWTPayload;
    const purpose = (payload as Record<string, unknown>).purpose;
    if (payload.sub !== params.userSub || purpose !== "password_change")
      throw new ValidationError("Invalid reauthentication token");
  } catch {
    throw new ValidationError("Invalid or expired reauthentication token");
  }
  const opaqueRecord = await context.services.opaque.finishRegistration(
    params.recordBuffer,
    params.email
  );
  await context.db.transaction(async (tx) => {
    const existing = await tx.query.opaqueRecords.findFirst({
      where: eq(opaqueRecords.sub, params.userSub),
    });
    const user = await tx.query.users.findFirst({
      where: eq(users.sub, params.userSub),
      columns: { passwordResetRequired: true },
    });
    const history = await tx.query.userOpaqueRecordHistory.findFirst({
      where: eq(userOpaqueRecordHistory.userSub, params.userSub),
    });
    const shouldStoreHistory = !user?.passwordResetRequired || !history;
    if (existing && shouldStoreHistory) {
      await tx
        .insert(userOpaqueRecordHistory)
        .values({
          userSub: params.userSub,
          envelope: existing.envelope,
          serverPubkey: existing.serverPubkey,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userOpaqueRecordHistory.userSub,
          set: {
            envelope: existing.envelope,
            serverPubkey: existing.serverPubkey,
            updatedAt: new Date(),
          },
        });
    }
    if (existing) {
      await tx
        .update(opaqueRecords)
        .set({
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: new Date(),
        })
        .where(eq(opaqueRecords.sub, params.userSub));
    } else {
      await tx.insert(opaqueRecords).values({
        sub: params.userSub,
        envelope: Buffer.from(opaqueRecord.envelope),
        serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
        updatedAt: new Date(),
      });
    }
    await tx
      .insert(userPasswordHistory)
      .values({ userSub: params.userSub, exportKeyHash: params.exportKeyHash });
    await tx
      .update(users)
      .set({ passwordResetRequired: false })
      .where(eq(users.sub, params.userSub));
  });
  return { success: true as const };
}

export async function startUserPasswordSetForAdmin(
  context: Context,
  userSub: string,
  requestBuffer: Uint8Array
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, userSub) });
  if (!user || !user.email) throw new NotFoundError("User not found");
  const registrationResponse = await context.services.opaque.startRegistration(
    requestBuffer,
    user.email
  );
  return { registrationResponse, identityU: user.email };
}

export async function finishUserPasswordSetForAdmin(
  context: Context,
  params: { userSub: string; recordBuffer: Uint8Array; exportKeyHash: string }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, params.userSub) });
  if (!user || !user.email) throw new NotFoundError("User not found");
  const anyMatch = await context.db.query.userPasswordHistory.findFirst({
    where: (_fields, operators) =>
      operators.and(
        operators.eq(userPasswordHistory.userSub, params.userSub),
        operators.eq(userPasswordHistory.exportKeyHash, params.exportKeyHash)
      ),
  });
  if (anyMatch) throw new ConflictError("Password reuse not allowed");
  const opaqueRecord = await context.services.opaque.finishRegistration(
    params.recordBuffer,
    user.email
  );
  await context.db.transaction(async (tx) => {
    const existing = await tx.query.opaqueRecords.findFirst({
      where: eq(opaqueRecords.sub, params.userSub),
    });
    if (existing) {
      await tx
        .insert(userOpaqueRecordHistory)
        .values({
          userSub: params.userSub,
          envelope: existing.envelope,
          serverPubkey: existing.serverPubkey,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userOpaqueRecordHistory.userSub,
          set: {
            envelope: existing.envelope,
            serverPubkey: existing.serverPubkey,
            updatedAt: new Date(),
          },
        });
    }
    if (existing) {
      await tx
        .update(opaqueRecords)
        .set({
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: new Date(),
        })
        .where(eq(opaqueRecords.sub, params.userSub));
    } else {
      await tx.insert(opaqueRecords).values({
        sub: params.userSub,
        envelope: Buffer.from(opaqueRecord.envelope),
        serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
        updatedAt: new Date(),
      });
    }
    await tx
      .insert(userPasswordHistory)
      .values({ userSub: params.userSub, exportKeyHash: params.exportKeyHash });
    await tx
      .update(users)
      .set({ passwordResetRequired: true })
      .where(eq(users.sub, params.userSub));
  });
  return { success: true as const };
}
