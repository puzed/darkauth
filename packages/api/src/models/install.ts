import { eq } from "drizzle-orm";
import {
  adminOpaqueRecords,
  adminUsers,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  roles,
  settings,
} from "../db/schema.ts";
import { ConflictError, NotFoundError } from "../errors.ts";
import type { Context } from "../types.ts";

export async function storeOpaqueAdmin(
  context: Context,
  data: {
    email: string;
    name: string;
    role: "read" | "write";
    envelope: Uint8Array;
    serverPublicKey: Uint8Array;
  }
) {
  await context.db.transaction(async (trx) => {
    let adm = await trx.query.adminUsers.findFirst({ where: eq(adminUsers.email, data.email) });
    if (!adm) {
      const [row] = await trx
        .insert(adminUsers)
        .values({ email: data.email, name: data.name, role: data.role })
        .returning();
      adm = row;
    }
    if (!adm) throw new Error("Failed to create admin user");
    const existing = await trx.query.adminOpaqueRecords.findFirst({
      where: eq(adminOpaqueRecords.adminId, adm.id),
    });
    if (existing) throw new ConflictError("OPAQUE record already exists");
    await trx.insert(adminOpaqueRecords).values({
      adminId: adm.id,
      envelope: Buffer.from(data.envelope),
      serverPubkey: Buffer.from(data.serverPublicKey),
    });
  });
}

export async function verifyAdminAndOpaque(context: Context, email: string) {
  const adm = await context.db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  if (!adm) throw new NotFoundError("Admin user must be created via OPAQUE registration first");
  const opaque = await context.db.query.adminOpaqueRecords.findFirst({
    where: eq(adminOpaqueRecords.adminId, adm.id),
  });
  if (!opaque) throw new NotFoundError("OPAQUE registration must be completed first");
  return adm.id;
}

export async function writeKdfSetting(context: Context, kdfParams: unknown) {
  await context.db
    .insert(settings)
    .values({ key: "kek_kdf", value: kdfParams, secure: true, updatedAt: new Date() });
}

export async function ensureDefaultOrganizationAndSchema(context: Context) {
  try {
    await context.db.execute(
      `CREATE TYPE IF NOT EXISTS "organization_status" AS ENUM ('active', 'invited', 'suspended');`
    );
  } catch {}
  try {
    await context.db.execute(
      `CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "force_otp" boolean NOT NULL DEFAULT false,
        "created_by_user_sub" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );`
    );
  } catch {}
  try {
    await context.db.execute(
      `ALTER TABLE "organizations"
       ADD COLUMN IF NOT EXISTS "force_otp" boolean NOT NULL DEFAULT false;`
    );
  } catch {}
  try {
    await context.db.execute(
      `CREATE TABLE IF NOT EXISTS "organization_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "user_sub" text NOT NULL,
        "status" "organization_status" NOT NULL DEFAULT 'active',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );`
    );
  } catch {}
  try {
    await context.db.execute(
      `INSERT INTO "organizations" ("slug", "name") VALUES ('default','Default') ON CONFLICT ("slug") DO NOTHING;`
    );
  } catch {}
  try {
    await context.db.execute(
      `INSERT INTO "organization_members" ("organization_id", "user_sub", "status")
       SELECT o.id, u.sub, 'active'::organization_status
       FROM users u
       JOIN organizations o ON o.slug = 'default'
       ON CONFLICT DO NOTHING;`
    );
  } catch {}
  try {
    await context.db.execute(
      `CREATE TABLE IF NOT EXISTS "otp_configs" (
        cohort text NOT NULL,
        subject_id text NOT NULL,
        secret_enc bytea NOT NULL,
        verified boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        last_used_at timestamp NULL,
        last_used_step bigint NULL,
        failure_count integer NOT NULL DEFAULT 0,
        locked_until timestamp NULL,
        PRIMARY KEY (cohort, subject_id)
      );`
    );
  } catch {}
  try {
    await context.db.execute(
      `CREATE TABLE IF NOT EXISTS "otp_backup_codes" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cohort text NOT NULL,
        subject_id text NOT NULL,
        code_hash text NOT NULL,
        used_at timestamp NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );`
    );
  } catch {}

  try {
    const defaultOrg = await context.db.query.organizations.findFirst({
      where: eq(organizations.slug, "default"),
    });
    const memberRole = await context.db.query.roles.findFirst({ where: eq(roles.key, "member") });
    if (!defaultOrg || !memberRole) return;
    const memberships = await context.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, defaultOrg.id));
    if (memberships.length > 0) {
      await context.db
        .insert(organizationMemberRoles)
        .values(
          memberships.map((membership) => ({
            organizationMemberId: membership.id,
            roleId: memberRole.id,
          }))
        )
        .onConflictDoNothing();
    }
  } catch {}
}
