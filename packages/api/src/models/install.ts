import { eq } from "drizzle-orm";
import {
  adminOpaqueRecords,
  adminUsers,
  clients,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  permissions,
  rolePermissions,
  roles,
  settings,
} from "../db/schema.js";
import { ConflictError, NotFoundError } from "../errors.js";
import type { Context } from "../types.js";

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

export function buildDefaultClientSeeds(demoConfidentialSecretEnc: Buffer | null) {
  return [
    {
      clientId: "demo-public-client",
      name: "Demo Public Client",
      type: "public" as const,
      tokenEndpointAuthMethod: "none" as const,
      clientSecretEnc: null,
      requirePkce: true,
      zkDelivery: "fragment-jwe" as const,
      zkRequired: true,
      allowedJweAlgs: ["ECDH-ES"],
      allowedJweEncs: ["A256GCM"],
      redirectUris: [
        "http://localhost:9092/",
        "http://localhost:9092/callback",
        "http://localhost:3000/",
        "http://localhost:3000/callback",
        "https://app.example.com/",
        "https://app.example.com/callback",
      ],
      postLogoutRedirectUris: [
        "http://localhost:9092/",
        "http://localhost:3000",
        "https://app.example.com",
      ],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      scopes: ["openid", "profile", "email"],
      allowedZkOrigins: [
        "http://localhost:9092",
        "http://localhost:3000",
        "https://app.example.com",
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      clientId: "demo-confidential-client",
      name: "Demo Confidential Client",
      type: "confidential" as const,
      tokenEndpointAuthMethod: "client_secret_basic" as const,
      clientSecretEnc: demoConfidentialSecretEnc,
      requirePkce: false,
      zkDelivery: "none" as const,
      zkRequired: false,
      allowedJweAlgs: [],
      allowedJweEncs: [],
      redirectUris: ["http://localhost:4000/callback", "https://support.example.com/callback"],
      postLogoutRedirectUris: ["http://localhost:4000", "https://support.example.com"],
      grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
      responseTypes: ["code"],
      scopes: ["openid", "profile", "darkauth.users:read"],
      allowedZkOrigins: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

export async function seedDefaultClients(
  context: Context,
  demoConfidentialSecretEnc: Buffer | null
) {
  await context.db.insert(clients).values(buildDefaultClientSeeds(demoConfidentialSecretEnc));
}

export async function seedDefaultOrganizationRbac(context: Context) {
  const usersReadPermission = await context.db.query.permissions.findFirst({
    where: eq(permissions.key, "darkauth.users:read"),
  });
  if (!usersReadPermission) {
    await context.db.insert(permissions).values({
      key: "darkauth.users:read",
      description: "Allows searching and reading users from the user directory endpoints",
    });
  }
  const orgManagePermission = await context.db.query.permissions.findFirst({
    where: eq(permissions.key, "darkauth.org:manage"),
  });
  if (!orgManagePermission) {
    await context.db.insert(permissions).values({
      key: "darkauth.org:manage",
      description: "Allows management of organization members, roles, and invites",
    });
  }

  const existingOrg = await context.db.query.organizations.findFirst({
    where: eq(organizations.slug, "default"),
  });
  if (!existingOrg) {
    await context.db
      .insert(organizations)
      .values({ slug: "default", name: "Default", createdAt: new Date(), updatedAt: new Date() });
  }

  const defaultOrg = await context.db.query.organizations.findFirst({
    where: eq(organizations.slug, "default"),
  });
  if (!defaultOrg) return;

  await context.db
    .insert(roles)
    .values([
      { key: "member", name: "Member", system: true, createdAt: new Date(), updatedAt: new Date() },
      {
        key: "org_admin",
        name: "Organization Admin",
        system: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        key: "otp_required",
        name: "OTP Required",
        system: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  const orgAdminRole = await context.db.query.roles.findFirst({
    where: eq(roles.key, "org_admin"),
  });
  if (orgAdminRole) {
    await context.db
      .insert(rolePermissions)
      .values([
        { roleId: orgAdminRole.id, permissionKey: "darkauth.org:manage" },
        { roleId: orgAdminRole.id, permissionKey: "darkauth.users:read" },
      ])
      .onConflictDoNothing();
  }
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
        "created_by_user_sub" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );`
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
    await seedDefaultOrganizationRbac(context);
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
