import { relations } from "drizzle-orm";
import {
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
export const sessionCohortEnum = pgEnum("session_cohort", ["user", "admin"]);
export const adminRoleEnum = pgEnum("admin_role", ["read", "write"]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  name: text("name"),
  type: text("type"),
  category: text("category"),
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
  refreshTokenLifetimeSeconds: integer("refresh_token_lifetime_seconds"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  sub: text("sub").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  passwordResetRequired: boolean("password_reset_required").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  expiresAt: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  hasZk: boolean("has_zk").default(false).notNull(),
  zkPubKid: text("zk_pub_kid"),
  drkHash: text("drk_hash"),
  drkJwe: text("drk_jwe"),
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
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  zkPubKid: text("zk_pub_kid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  userSub: text("user_sub").references(() => users.sub, {
    onDelete: "cascade",
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

export const groups = pgTable("groups", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
});

export const groupPermissions = pgTable(
  "group_permissions",
  {
    groupKey: text("group_key")
      .notNull()
      .references(() => groups.key, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupKey, table.permissionKey] }),
  })
);

export const userGroups = pgTable(
  "user_groups",
  {
    userSub: text("user_sub")
      .notNull()
      .references(() => users.sub, { onDelete: "cascade" }),
    groupKey: text("group_key")
      .notNull()
      .references(() => groups.key, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userSub, table.groupKey] }),
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
  groups: many(userGroups),
  permissions: many(userPermissions),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  authCodes: many(authCodes),
  pendingAuth: many(pendingAuth),
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

export const groupsRelations = relations(groups, ({ many }) => ({
  permissions: many(groupPermissions),
  users: many(userGroups),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  groups: many(groupPermissions),
  users: many(userPermissions),
}));

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
  user: one(users, {
    fields: [userGroups.userSub],
    references: [users.sub],
  }),
  group: one(groups, {
    fields: [userGroups.groupKey],
    references: [groups.key],
  }),
}));

export const groupPermissionsRelations = relations(groupPermissions, ({ one }) => ({
  group: one(groups, {
    fields: [groupPermissions.groupKey],
    references: [groups.key],
  }),
  permission: one(permissions, {
    fields: [groupPermissions.permissionKey],
    references: [permissions.key],
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
