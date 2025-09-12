import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminUsers, clients, groups, settings } from "../db/schema.js";
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

export async function seedDefaultClients(context: Context, supportDeskSecretEnc: Buffer | null) {
  await context.db.insert(clients).values([
    {
      clientId: "app-web",
      name: "Web Application",
      type: "public",
      tokenEndpointAuthMethod: "none",
      clientSecretEnc: null,
      requirePkce: true,
      zkDelivery: "fragment-jwe",
      zkRequired: true,
      allowedJweAlgs: ["ECDH-ES"],
      allowedJweEncs: ["A256GCM"],
      redirectUris: [
        "http://localhost:9092/",
        "http://localhost:9092/callback",
        "http://localhost:3000/callback",
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
      clientId: "support-desk",
      name: "Support Desk",
      type: "confidential",
      tokenEndpointAuthMethod: "client_secret_basic",
      clientSecretEnc: supportDeskSecretEnc,
      requirePkce: false,
      zkDelivery: "none",
      zkRequired: false,
      allowedJweAlgs: [],
      allowedJweEncs: [],
      redirectUris: ["http://localhost:4000/callback", "https://support.example.com/callback"],
      postLogoutRedirectUris: ["http://localhost:4000", "https://support.example.com"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      scopes: ["openid", "profile"],
      allowedZkOrigins: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

export async function seedDefaultGroups(context: Context) {
  const existing = await context.db.query.groups.findFirst({ where: eq(groups.key, "default") });
  if (!existing) {
    await context.db.insert(groups).values({ key: "default", name: "Default", enableLogin: true });
  }
}

export async function ensureDefaultGroupAndSchema(context: Context) {
  try {
    await context.db.execute(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "enable_login" boolean NOT NULL DEFAULT true;`
    );
  } catch {}
  try {
    await context.db.execute(
      `INSERT INTO "groups" ("key", "name", "enable_login") VALUES ('default','Default',true) ON CONFLICT ("key") DO NOTHING;`
    );
  } catch {}
  try {
    await context.db.execute(
      `INSERT INTO "user_groups" ("user_sub", "group_key") SELECT u.sub, 'default' FROM users u LEFT JOIN user_groups ug ON ug.user_sub = u.sub WHERE ug.user_sub IS NULL;`
    );
  } catch {}
}
