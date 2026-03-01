import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Custom bytea type definition
export const bytea = customType<{
  data: Buffer | null;
  notNull: false;
  default: false;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer | null) {
    return value;
  },
  fromDriver(value: unknown) {
    return value as Buffer | null;
  },
});

export const clientTypeEnum = pgEnum("client_type", ["public", "confidential"]);
export const tokenEndpointAuthMethodEnum = pgEnum("token_endpoint_auth_method", [
  "none",
  "client_secret_basic",
]);
export const zkDeliveryEnum = pgEnum("zk_delivery", ["none", "fragment-jwe"]);
export const dashboardIconModeEnum = pgEnum("dashboard_icon_mode", ["letter", "emoji", "upload"]);
export const sessionCohortEnum = pgEnum("session_cohort", ["user", "admin"]);
export const adminRoleEnum = pgEnum("admin_role", ["read", "write"]);
export const organizationStatusEnum = pgEnum("organization_status", [
  "active",
  "invited",
  "suspended",
]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  name: text("name"),
  type: text("type"),
  category: text("category"),
  description: text("description"),
  tags: text("tags").array().default([]).notNull(),
  defaultValue: jsonb("default_value"),
  value: jsonb("value").notNull(),
  secure: boolean("secure").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jwks = pgTable("jwks", {
  kid: text("kid").primaryKey(),
  alg: text("alg").notNull(),
  publicJwk: jsonb("public_jwk").notNull(),
  privateJwkEnc: bytea("private_jwk_enc"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rotatedAt: timestamp("rotated_at"),
});

export const clients = pgTable("clients", {
  clientId: text("client_id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  appUrl: text("app_url"),
  dashboardPosition: integer("dashboard_position").default(0).notNull(),
  dashboardIconMode: dashboardIconModeEnum("dashboard_icon_mode").default("letter").notNull(),
  dashboardIconEmoji: text("dashboard_icon_emoji"),
  dashboardIconLetter: text("dashboard_icon_letter"),
  dashboardIconMimeType: text("dashboard_icon_mime_type"),
  dashboardIconData: bytea("dashboard_icon_data"),
  logoUrl: text("logo_url"),
  showOnUserDashboard: boolean("show_on_user_dashboard").default(false).notNull(),
  type: clientTypeEnum("type").notNull(),
  tokenEndpointAuthMethod: tokenEndpointAuthMethodEnum("token_endpoint_auth_method").notNull(),
  clientSecretEnc: bytea("client_secret_enc"),
  requirePkce: boolean("require_pkce").default(true).notNull(),
  zkDelivery: zkDeliveryEnum("zk_delivery").default("none").notNull(),
  zkRequired: boolean("zk_required").default(false).notNull(),
  allowedJweAlgs: text("allowed_jwe_algs").array().default([]).notNull(),
  allowedJweEncs: text("allowed_jwe_encs").array().default([]).notNull(),
  redirectUris: text("redirect_uris").array().default([]).notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array().default([]).notNull(),
  grantTypes: text("grant_types").array().default(["authorization_code"]).notNull(),
  responseTypes: text("response_types").array().default(["code"]).notNull(),
  scopes: text("scopes").array().default(["openid", "profile"]).notNull(),
  allowedZkOrigins: text("allowed_zk_origins").array().default([]).notNull(),
  idTokenLifetimeSeconds: integer("id_token_lifetime_seconds"),
  accessTokenLifetimeSeconds: integer("access_token_lifetime_seconds"),
  refreshTokenLifetimeSeconds: integer("refresh_token_lifetime_seconds"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  sub: text("sub").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  emailVerifiedAt: timestamp("email_verified_at"),
  pendingEmail: text("pending_email"),
  pendingEmailSetAt: timestamp("pending_email_set_at"),
  passwordResetRequired: boolean("password_reset_required").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userSub: text("user_sub")
      .notNull()
      .references(() => users.sub, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    targetEmail: text("target_email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPurposeIdx: index("email_verification_tokens_user_purpose_idx").on(
      table.userSub,
      table.purpose
    ),
    expiresAtIdx: index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
  })
);

export const opaqueRecords = pgTable("opaque_records", {
  sub: text("sub")
    .primaryKey()
    .references(() => users.sub, { onDelete: "cascade" }),
  envelope: bytea("envelope").notNull(),
  serverPubkey: bytea("server_pubkey").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wrappedRootKeys = pgTable("wrapped_root_keys", {
  sub: text("sub")
    .primaryKey()
    .references(() => users.sub, { onDelete: "cascade" }),
  wrappedDrk: bytea("wrapped_drk").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userEncryptionKeys = pgTable("user_encryption_keys", {
  sub: text("sub")
    .primaryKey()
    .references(() => users.sub, { onDelete: "cascade" }),
  encPublicJwk: jsonb("enc_public_jwk").notNull(),
  encPrivateJwkWrapped: bytea("enc_private_jwk_wrapped"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authCodes = pgTable("auth_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.clientId, { onDelete: "cascade" }),
  userSub: text("user_sub")
    .notNull()
    .references(() => users.sub, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  redirectUri: text("redirect_uri").notNull(),
  nonce: text("nonce"),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  expiresAt: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  hasZk: boolean("has_zk").default(false).notNull(),
  zkPubKid: text("zk_pub_kid"),
  drkHash: text("drk_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  cohort: sessionCohortEnum("cohort").notNull(),
  userSub: text("user_sub").references(() => users.sub, {
    onDelete: "cascade",
  }),
  adminId: uuid("admin_id").references(() => adminUsers.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  data: jsonb("data").default({}).notNull(),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  refreshTokenConsumedAt: timestamp("refresh_token_consumed_at"),
});

export const opaqueLoginSessions = pgTable("opaque_login_sessions", {
  id: text("id").primaryKey(),
  serverState: bytea("server_state").notNull(),
  identityS: text("identity_s").notNull(),
  identityU: text("identity_u").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const pendingAuth = pgTable("pending_auth", {
  requestId: text("request_id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.clientId, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  state: text("state"),
  nonce: text("nonce"),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  zkPubKid: text("zk_pub_kid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  userSub: text("user_sub").references(() => users.sub, {
    onDelete: "cascade",
  }),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  origin: text("origin").notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  role: adminRoleEnum("role").notNull(),
  passwordResetRequired: boolean("password_reset_required").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userPasswordHistory = pgTable("user_password_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userSub: text("user_sub")
    .notNull()
    .references(() => users.sub, { onDelete: "cascade" }),
  exportKeyHash: text("export_key_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userOpaqueRecordHistory = pgTable("user_opaque_record_history", {
  userSub: text("user_sub")
    .primaryKey()
    .references(() => users.sub, { onDelete: "cascade" }),
  envelope: bytea("envelope").notNull(),
  serverPubkey: bytea("server_pubkey").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adminPasswordHistory = pgTable("admin_password_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  exportKeyHash: text("export_key_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminOpaqueRecords = pgTable("admin_opaque_records", {
  adminId: uuid("admin_id")
    .primaryKey()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  envelope: bytea("envelope").notNull(),
  serverPubkey: bytea("server_pubkey").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  forceOtp: boolean("force_otp").default(false).notNull(),
  createdByUserSub: text("created_by_user_sub").references(() => users.sub, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userSub: text("user_sub")
      .notNull()
      .references(() => users.sub, { onDelete: "cascade" }),
    status: organizationStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueMembershipIdx: uniqueIndex("organization_members_organization_user_idx").on(
      table.organizationId,
      table.userSub
    ),
    userSubIdx: index("organization_members_user_sub_idx").on(table.userSub),
    organizationIdIdx: index("organization_members_organization_id_idx").on(table.organizationId),
  })
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  system: boolean("system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionKey] }),
    roleIdIdx: index("role_permissions_role_id_idx").on(table.roleId),
  })
);

export const organizationMemberRoles = pgTable(
  "organization_member_roles",
  {
    organizationMemberId: uuid("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationMemberId, table.roleId] }),
    organizationMemberIdIdx: index("organization_member_roles_member_id_idx").on(
      table.organizationMemberId
    ),
  })
);

export const organizationInvites = pgTable(
  "organization_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleIds: uuid("role_ids").array().default([]).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdByUserSub: text("created_by_user_sub").references(() => users.sub, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdIdx: index("organization_invites_organization_id_idx").on(table.organizationId),
    emailIdx: index("organization_invites_email_idx").on(table.email),
    expiresAtIdx: index("organization_invites_expires_at_idx").on(table.expiresAt),
  })
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userSub: text("user_sub")
      .notNull()
      .references(() => users.sub, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userSub, table.permissionKey] }),
  })
);

export const otpConfigs = pgTable(
  "otp_configs",
  {
    cohort: text("cohort").notNull(),
    subjectId: text("subject_id").notNull(),
    secretEnc: bytea("secret_enc").notNull(),
    verified: boolean("verified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    lastUsedStep: bigint("last_used_step", { mode: "bigint" }),
    failureCount: integer("failure_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => ({ pk: primaryKey({ columns: [table.cohort, table.subjectId] }) })
);

export const otpBackupCodes = pgTable("otp_backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  cohort: text("cohort").notNull(),
  subjectId: text("subject_id").notNull(),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  opaqueRecord: one(opaqueRecords, {
    fields: [users.sub],
    references: [opaqueRecords.sub],
  }),
  wrappedRootKey: one(wrappedRootKeys, {
    fields: [users.sub],
    references: [wrappedRootKeys.sub],
  }),
  authCodes: many(authCodes),
  sessions: many(sessions),
  organizations: many(organizationMembers),
  permissions: many(userPermissions),
  emailVerificationTokens: many(emailVerificationTokens),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userSub],
    references: [users.sub],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  authCodes: many(authCodes),
  pendingAuth: many(pendingAuth),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [organizations.createdByUserSub],
    references: [users.sub],
  }),
  members: many(organizationMembers),
  invites: many(organizationInvites),
  authCodes: many(authCodes),
  pendingAuth: many(pendingAuth),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userSub],
    references: [users.sub],
  }),
  roles: many(organizationMemberRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  members: many(organizationMemberRoles),
}));

export const adminUsersRelations = relations(adminUsers, ({ one, many }) => ({
  opaqueRecord: one(adminOpaqueRecords, {
    fields: [adminUsers.id],
    references: [adminOpaqueRecords.adminId],
  }),
  sessions: many(sessions),
}));

export const adminOpaqueRecordsRelations = relations(adminOpaqueRecords, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminOpaqueRecords.adminId],
    references: [adminUsers.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  users: many(userPermissions),
  roles: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionKey],
    references: [permissions.key],
  }),
}));

export const organizationMemberRolesRelations = relations(organizationMemberRoles, ({ one }) => ({
  organizationMember: one(organizationMembers, {
    fields: [organizationMemberRoles.organizationMemberId],
    references: [organizationMembers.id],
  }),
  role: one(roles, {
    fields: [organizationMemberRoles.roleId],
    references: [roles.id],
  }),
}));

export const organizationInvitesRelations = relations(organizationInvites, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvites.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [organizationInvites.createdByUserSub],
    references: [users.sub],
  }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userSub],
    references: [users.sub],
  }),
  permission: one(permissions, {
    fields: [userPermissions.permissionKey],
    references: [permissions.key],
  }),
}));

// Audit logs table
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    eventType: text("event_type").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    cohort: text("cohort"), // "user" or "admin"
    userId: text("user_id"),
    adminId: uuid("admin_id"),
    clientId: text("client_id"),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    statusCode: integer("status_code"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    action: text("action"),
    requestBody: jsonb("request_body"),
    changes: jsonb("changes"),
    responseTime: integer("response_time"),
    details: jsonb("details"),
  },
  (table) => ({
    timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
    userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
    adminIdIdx: index("audit_logs_admin_id_idx").on(table.adminId),
    eventTypeIdx: index("audit_logs_event_type_idx").on(table.eventType),
    resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  })
);
