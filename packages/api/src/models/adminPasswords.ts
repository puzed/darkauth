import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminPasswordHistory, adminUsers } from "../db/schema.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { Context } from "../types.js";

export async function getAdminOpaqueRecordByAdminId(context: Context, adminId: string) {
  const row = await context.db.query.adminOpaqueRecords.findFirst({
    where: eq(adminOpaqueRecords.adminId, adminId),
  });
  return row;
}

export async function adminPasswordChangeFinish(
  context: Context,
  params: { adminId: string; email: string; recordBuffer: Uint8Array; exportKeyHash: string }
) {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  const anyMatch = await context.db.query.adminPasswordHistory.findFirst({
    where: (_fields, operators) =>
      operators.and(
        operators.eq(adminPasswordHistory.adminId, params.adminId),
        operators.eq(adminPasswordHistory.exportKeyHash, params.exportKeyHash)
      ),
  });
  if (anyMatch) throw new ConflictError("Password reuse not allowed");
  const opaqueRecord = await context.services.opaque.finishRegistration(
    params.recordBuffer,
    params.email
  );
  await context.db.transaction(async (tx) => {
    const existing = await tx.query.adminOpaqueRecords.findFirst({
      where: eq(adminOpaqueRecords.adminId, params.adminId),
    });
    if (existing) {
      await tx
        .update(adminOpaqueRecords)
        .set({
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: new Date(),
        })
        .where(eq(adminOpaqueRecords.adminId, params.adminId));
    } else {
      await tx.insert(adminOpaqueRecords).values({
        adminId: params.adminId,
        envelope: Buffer.from(opaqueRecord.envelope),
        serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
        updatedAt: new Date(),
      });
    }
    await tx
      .insert(adminPasswordHistory)
      .values({ adminId: params.adminId, exportKeyHash: params.exportKeyHash });
    await tx
      .update(adminUsers)
      .set({ passwordResetRequired: false })
      .where(eq(adminUsers.id, params.adminId));
  });
  return { success: true as const };
}

export async function adminUserPasswordSetFinish(
  context: Context,
  params: { adminId: string; email: string; recordBuffer: Uint8Array; exportKeyHash: string }
) {
  // validate target admin exists
  const target = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, params.adminId),
  });
  if (!target) throw new NotFoundError("Admin user not found");
  return await adminPasswordChangeFinish(context, params);
}
