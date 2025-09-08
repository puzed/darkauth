import { eq } from "drizzle-orm";
import { settings, adminUsers, permissions, groups } from "../db/schema.js";
import { ValidationError, ConflictError } from "../errors.js";
import type { Context } from "../types.js";
import { createJWKSKey } from "./jwks.js";
import { setSetting } from "./settings.js";
import { createGroup } from "./groupManagement.js";

export interface InstallationStatus {
  isInstalled: boolean;
  hasAdminUsers: boolean;
  hasJWKS: boolean;
  hasBasicSettings: boolean;
  version?: string;
  installedAt?: Date;
}

export interface InstallationData {
  adminUser: {
    email: string;
    name: string;
    role: "read" | "write";
  };
  opaqueData: {
    registrationFinish: string;
    sessionId: string;
  };
  settings: {
    issuer: string;
    organizationName: string;
    [key: string]: any;
  };
}

export interface InstallationResult {
  success: boolean;
  adminUserId: string;
  message: string;
}

/**
 * Checks the current installation status
 */
export async function getInstallationStatus(context: Context): Promise<InstallationStatus> {
  // Check if installation is marked as complete
  const installSetting = await context.db.query.settings.findFirst({
    where: eq(settings.key, "system.installed"),
  });

  const isInstalled = installSetting?.value === "true";

  // Check for admin users
  const adminUserCount = await context.db.query.adminUsers.findMany();
  const hasAdminUsers = adminUserCount.length > 0;

  // Check for JWKS keys
  const jwksKeys = await context.db.query.jwks.findMany();
  const hasJWKS = jwksKeys.length > 0;

  // Check for basic settings
  const issuerSetting = await context.db.query.settings.findFirst({
    where: eq(settings.key, "issuer"),
  });
  const hasBasicSettings = !!issuerSetting;

  // Get installation date
  const installDateSetting = await context.db.query.settings.findFirst({
    where: eq(settings.key, "system.installed_at"),
  });
  const installedAt = installDateSetting ? new Date(installDateSetting.value) : undefined;

  // Get version
  const versionSetting = await context.db.query.settings.findFirst({
    where: eq(settings.key, "system.version"),
  });
  const version = versionSetting?.value;

  return {
    isInstalled,
    hasAdminUsers,
    hasJWKS,
    hasBasicSettings,
    version,
    installedAt,
  };
}

/**
 * Performs the initial system installation
 */
export async function performInstallation(
  context: Context,
  data: InstallationData
): Promise<InstallationResult> {
  const status = await getInstallationStatus(context);

  // Check if already installed
  if (status.isInstalled) {
    throw new ConflictError("System is already installed");
  }

  try {
    // 1. Create default permissions if they don't exist
    await createDefaultPermissions(context);

    // 2. Create default groups
    await createDefaultGroups(context);

    // 3. Complete OPAQUE registration and create admin user
    const adminUser = await completeOpaqueRegistration(context, data);

    // 4. Generate initial JWKS keys
    await createInitialJWKS(context);

    // 5. Set basic system settings
    await setInitialSettings(context, data.settings);

    // 6. Mark installation as complete
    await setSetting(context, "system.installed", "true");
    await setSetting(context, "system.installed_at", new Date().toISOString());
    await setSetting(context, "system.version", process.env.APP_VERSION || "1.0.0");

    return {
      success: true,
      adminUserId: adminUser.id,
      message: "Installation completed successfully",
    };
  } catch (error) {
    // Rollback on error would go here in a real implementation
    throw error;
  }
}

/**
 * Creates default permissions for the system
 */
async function createDefaultPermissions(context: Context): Promise<void> {
  const defaultPermissions = [
    { key: "admin.read", name: "Admin Read", description: "Read access to admin features" },
    { key: "admin.write", name: "Admin Write", description: "Write access to admin features" },
    { key: "users.read", name: "Users Read", description: "Read user information" },
    { key: "users.write", name: "Users Write", description: "Manage users" },
    { key: "clients.read", name: "Clients Read", description: "View OAuth clients" },
    { key: "clients.write", name: "Clients Write", description: "Manage OAuth clients" },
    { key: "groups.read", name: "Groups Read", description: "View groups" },
    { key: "groups.write", name: "Groups Write", description: "Manage groups" },
    { key: "permissions.read", name: "Permissions Read", description: "View permissions" },
    { key: "permissions.write", name: "Permissions Write", description: "Manage permissions" },
    { key: "settings.read", name: "Settings Read", description: "View system settings" },
    { key: "settings.write", name: "Settings Write", description: "Manage system settings" },
    { key: "audit.read", name: "Audit Read", description: "View audit logs" },
    { key: "audit.export", name: "Audit Export", description: "Export audit logs" },
    { key: "profile.read", name: "Profile Read", description: "Read own profile" },
    { key: "profile.write", name: "Profile Write", description: "Update own profile" },
  ];

  for (const perm of defaultPermissions) {
    await context.db.insert(permissions).values({
      key: perm.key,
      name: perm.name,
      description: perm.description,
      createdAt: new Date(),
    }).onConflictDoNothing();
  }
}

/**
 * Creates default groups with appropriate permissions
 */
async function createDefaultGroups(context: Context): Promise<void> {
  // Admin group - full access
  const adminPermissions = [
    "admin.read", "admin.write", "users.read", "users.write",
    "clients.read", "clients.write", "groups.read", "groups.write",
    "permissions.read", "permissions.write", "settings.read", "settings.write",
    "audit.read", "audit.export", "profile.read", "profile.write"
  ];

  try {
    await createGroup(context, {
      key: "admin",
      name: "Administrators",
      description: "Full system administrators",
      color: "#dc2626",
    }, adminPermissions);
  } catch (error) {
    // Group might already exist, ignore conflict errors
    if (!(error instanceof ConflictError)) {
      throw error;
    }
  }

  // User group - basic access
  const userPermissions = ["profile.read", "profile.write"];

  try {
    await createGroup(context, {
      key: "users",
      name: "Users",
      description: "Default user group",
      color: "#2563eb",
    }, userPermissions);
  } catch (error) {
    // Group might already exist, ignore conflict errors
    if (!(error instanceof ConflictError)) {
      throw error;
    }
  }
}

/**
 * Completes OPAQUE registration for the first admin user
 */
async function completeOpaqueRegistration(
  context: Context,
  data: InstallationData
): Promise<{ id: string; email: string }> {
  // This would use the OPAQUE model to complete registration
  const { finishAdminOpaqueRegister } = await import("./opaque.js");

  const result = await finishAdminOpaqueRegister(
    context,
    data.opaqueData.sessionId,
    data.opaqueData.registrationFinish,
    data.adminUser
  );

  if (!result.success) {
    throw new ValidationError("Failed to complete admin user registration");
  }

  return { id: result.adminId, email: data.adminUser.email };
}

/**
 * Creates initial JWKS keys for JWT signing
 */
async function createInitialJWKS(context: Context): Promise<void> {
  // Generate an RS256 key for JWT signing
  const keyData = await context.services.crypto.generateJWK({
    alg: "RS256",
    use: "sig",
    kty: "RSA",
  });

  const kid = context.services.crypto.generateRandomString(16);

  await createJWKSKey(context, {
    kid,
    kty: "RSA",
    use: "sig",
    alg: "RS256",
    key: JSON.stringify(keyData),
    isActive: true,
  });
}

/**
 * Sets initial system settings
 */
async function setInitialSettings(context: Context, settings: Record<string, any>): Promise<void> {
  // Required settings
  const requiredSettings = {
    "issuer": settings.issuer,
    "organization.name": settings.organizationName || "DarkAuth Instance",
    "id_token.lifetime_seconds": 300,
    "refresh_token.lifetime_seconds": 604800, // 7 days
    "session.lifetime_hours": 24,
    "rate_limit.default.requests": 100,
    "rate_limit.default.window": 3600, // 1 hour
    "rate_limit.auth.requests": 10,
    "rate_limit.auth.window": 300, // 5 minutes
    "audit.retention_days": 90,
    "security.require_https": process.env.NODE_ENV === "production",
    "ui.theme": "light",
    "ui.logo_url": null,
    ...settings,
  };

  // Set all required settings
  for (const [key, value] of Object.entries(requiredSettings)) {
    if (value !== undefined) {
      await setSetting(context, key, value);
    }
  }
}

/**
 * Validates installation data
 */
export function validateInstallationData(data: InstallationData): void {
  // Validate admin user
  if (!data.adminUser?.email) {
    throw new ValidationError("Admin user email is required");
  }

  if (!data.adminUser?.name) {
    throw new ValidationError("Admin user name is required");
  }

  if (!["read", "write"].includes(data.adminUser?.role)) {
    throw new ValidationError("Admin user role must be 'read' or 'write'");
  }

  // Validate OPAQUE data
  if (!data.opaqueData?.sessionId) {
    throw new ValidationError("OPAQUE session ID is required");
  }

  if (!data.opaqueData?.registrationFinish) {
    throw new ValidationError("OPAQUE registration finish data is required");
  }

  // Validate settings
  if (!data.settings?.issuer) {
    throw new ValidationError("Issuer URL is required");
  }

  try {
    new URL(data.settings.issuer);
  } catch {
    throw new ValidationError("Issuer must be a valid URL");
  }
}

/**
 * Resets the installation (for development/testing)
 */
export async function resetInstallation(context: Context): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new ValidationError("Installation reset not allowed in production");
  }

  // This would delete all data and reset the system
  // Implementation would depend on specific requirements
  await setSetting(context, "system.installed", "false");
}