import { lookup as defaultLookup, resolveTxt as defaultResolveTxt } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import {
  federationConnectionDomains,
  federationConnections,
  federationIdentities,
  federationOidcStates,
  organizationMembers,
  organizations,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";

export type FederationAccountLinkingPolicy = "disabled" | "email_verified" | "email";
export type FederationClaimMapping = {
  subject?: string;
  email?: string;
  emailVerified?: string;
  name?: string;
  groups?: string;
};

export type OidcDiscoveryMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  response_types_supported?: string[];
  subject_types_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  scopes_supported?: string[];
  claims_supported?: string[];
  [key: string]: unknown;
};

const DEFAULT_SCOPES = ["openid", "profile", "email"];
const DEFAULT_CLAIM_MAPPING = {
  subject: "sub",
  email: "email",
  emailVerified: "email_verified",
  name: "name",
};
const LINKING_POLICIES = new Set(["disabled", "email_verified"]);
const DOMAIN_STATUSES = new Set(["pending", "verified", "failed"]);

const DOMAIN_VERIFICATION_PREFIX = "_darkauth-verification";
const DOMAIN_VERIFICATION_VALUE_PREFIX = "darkauth-domain-verification";

type FederationDomainVerificationStatus = "pending" | "verified" | "failed";

export type TxtResolver = (hostname: string) => Promise<string[][]>;

export function federationDomainRecordName(domain: string) {
  return `${DOMAIN_VERIFICATION_PREFIX}.${domain}`;
}

export function federationDomainRecordValue(token: string) {
  return `${DOMAIN_VERIFICATION_VALUE_PREFIX}=${token}`;
}

export async function listFederationConnections(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    enabled?: boolean;
    sortBy?: "createdAt" | "updatedAt" | "name" | "issuer";
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn =
    sortBy === "updatedAt"
      ? federationConnections.updatedAt
      : sortBy === "name"
        ? federationConnections.name
        : sortBy === "issuer"
          ? federationConnections.issuer
          : federationConnections.createdAt;
  const searchTerm = options.search?.trim() ? `%${options.search.trim()}%` : undefined;
  const conditions = [];
  if (searchTerm) {
    conditions.push(
      or(
        ilike(federationConnections.name, searchTerm),
        ilike(federationConnections.issuer, searchTerm)
      )
    );
  }
  if (typeof options.enabled === "boolean") {
    conditions.push(eq(federationConnections.enabled, options.enabled));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const totalRows = await (where
    ? context.db.select({ count: count() }).from(federationConnections).where(where)
    : context.db.select({ count: count() }).from(federationConnections));
  const rows = await (where
    ? context.db.select().from(federationConnections).where(where)
    : context.db.select().from(federationConnections)
  )
    .orderBy(sortFn(sortColumn), asc(federationConnections.name))
    .limit(limit)
    .offset(offset);
  const total = totalRows[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);
  return {
    connections: rows.map(redactConnection),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getFederationConnection(context: Context, id: string) {
  validateId(id, "connection id");
  const row = await context.db.query.federationConnections.findFirst({
    where: eq(federationConnections.id, id),
  });
  if (!row) throw new NotFoundError("Federation connection not found");
  return redactConnection(row);
}

export async function getFederationConnectionSecret(context: Context, id: string) {
  validateId(id, "connection id");
  const row = await context.db.query.federationConnections.findFirst({
    where: eq(federationConnections.id, id),
  });
  if (!row) throw new NotFoundError("Federation connection not found");
  return row;
}

export async function createFederationConnection(
  context: Context,
  data: {
    organizationId?: string;
    name: string;
    issuer: string;
    clientId: string;
    clientSecret?: string | null;
    discoveryUrl?: string;
    metadata?: OidcDiscoveryMetadata;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
    userinfoEndpoint?: string | null;
    scopes?: string[];
    claimMapping?: FederationClaimMapping;
    accountLinkingPolicy?: FederationAccountLinkingPolicy;
    jitProvisioning?: boolean;
    membershipOnAuthentication?: boolean;
    requireScimPreProvisioning?: boolean;
    requirePasswordForZk?: boolean;
    allowPasskeyPrf?: boolean;
    allowTrustedDeviceApproval?: boolean;
    allowNonZkKeySetupBypass?: boolean;
    domains?: string[];
    enabled?: boolean;
  }
) {
  const now = new Date();
  const normalized = normalizeConnectionInput(data);
  const organizationId = await resolveConnectionOrganizationId(context, data.organizationId);
  await assertVerifiedDomainsAvailable(context, normalized.domains);
  const clientSecretEnc = await encryptSecret(context, data.clientSecret);
  const row = {
    organizationId,
    type: "oidc",
    protocol: "oidc",
    name: normalized.name,
    issuer: normalized.issuer,
    clientId: normalized.clientId,
    clientSecretEnc,
    discoveryUrl: normalized.discoveryUrl,
    authorizationEndpoint: normalized.authorizationEndpoint,
    tokenEndpoint: normalized.tokenEndpoint,
    jwksUri: normalized.jwksUri,
    userinfoEndpoint: normalized.userinfoEndpoint,
    scopes: normalized.scopes,
    claimMapping: normalized.claimMapping,
    accountLinkingPolicy: normalized.accountLinkingPolicy,
    jitProvisioning: normalized.jitProvisioning,
    membershipOnAuthentication: normalized.membershipOnAuthentication,
    requireScimPreProvisioning: normalized.requireScimPreProvisioning,
    requirePasswordForZk: normalized.requirePasswordForZk,
    allowPasskeyPrf: normalized.allowPasskeyPrf,
    allowTrustedDeviceApproval: normalized.allowTrustedDeviceApproval,
    allowNonZkKeySetupBypass: normalized.allowNonZkKeySetupBypass,
    domains: normalized.domains,
    enabled: normalized.enabled,
    metadata: normalized.metadata,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof federationConnections.$inferInsert;
  try {
    const [created] = await context.db.insert(federationConnections).values(row).returning();
    if (!created) throw new ConflictError("Federation connection was not created");
    await replaceFederationConnectionDomains(
      context,
      created.id,
      created.organizationId,
      normalized.domains,
      { verificationStatus: "verified" }
    );
    return redactConnection(created);
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    if (isUniqueError(error)) throw new ConflictError("Federation connection already exists");
    throw error;
  }
}

export async function updateFederationConnection(
  context: Context,
  id: string,
  updates: Partial<Parameters<typeof createFederationConnection>[1]>
) {
  validateId(id, "connection id");
  const existing = await getFederationConnectionSecret(context, id);
  const organizationId = updates.organizationId
    ? await resolveConnectionOrganizationId(context, updates.organizationId)
    : existing.organizationId;
  const merged = {
    organizationId,
    name: updates.name ?? existing.name,
    issuer: updates.issuer ?? existing.issuer,
    clientId: updates.clientId ?? existing.clientId,
    clientSecret: undefined,
    discoveryUrl: updates.discoveryUrl ?? existing.discoveryUrl,
    metadata: updates.metadata ?? (existing.metadata as OidcDiscoveryMetadata),
    authorizationEndpoint: updates.authorizationEndpoint ?? existing.authorizationEndpoint,
    tokenEndpoint: updates.tokenEndpoint ?? existing.tokenEndpoint,
    jwksUri: updates.jwksUri ?? existing.jwksUri,
    userinfoEndpoint: Object.hasOwn(updates, "userinfoEndpoint")
      ? updates.userinfoEndpoint
      : existing.userinfoEndpoint,
    scopes: updates.scopes ?? existing.scopes,
    claimMapping: (updates.claimMapping ?? existing.claimMapping) as FederationClaimMapping,
    accountLinkingPolicy:
      updates.accountLinkingPolicy ??
      (existing.accountLinkingPolicy as FederationAccountLinkingPolicy),
    jitProvisioning: updates.jitProvisioning ?? existing.jitProvisioning,
    membershipOnAuthentication:
      updates.membershipOnAuthentication ?? existing.membershipOnAuthentication,
    requireScimPreProvisioning:
      updates.requireScimPreProvisioning ?? existing.requireScimPreProvisioning,
    requirePasswordForZk: updates.requirePasswordForZk ?? existing.requirePasswordForZk,
    allowPasskeyPrf: updates.allowPasskeyPrf ?? existing.allowPasskeyPrf,
    allowTrustedDeviceApproval:
      updates.allowTrustedDeviceApproval ?? existing.allowTrustedDeviceApproval,
    allowNonZkKeySetupBypass: updates.allowNonZkKeySetupBypass ?? existing.allowNonZkKeySetupBypass,
    domains: updates.domains ?? existing.domains,
    enabled: updates.enabled ?? existing.enabled,
  };
  const normalized = normalizeConnectionInput(merged);
  if (updates.domains || updates.organizationId) {
    await assertVerifiedDomainsAvailable(context, normalized.domains, id);
  }
  const patch: Partial<typeof federationConnections.$inferInsert> = {
    organizationId,
    name: normalized.name,
    issuer: normalized.issuer,
    clientId: normalized.clientId,
    discoveryUrl: normalized.discoveryUrl,
    authorizationEndpoint: normalized.authorizationEndpoint,
    tokenEndpoint: normalized.tokenEndpoint,
    jwksUri: normalized.jwksUri,
    userinfoEndpoint: normalized.userinfoEndpoint,
    scopes: normalized.scopes,
    claimMapping: normalized.claimMapping,
    accountLinkingPolicy: normalized.accountLinkingPolicy,
    jitProvisioning: normalized.jitProvisioning,
    membershipOnAuthentication: normalized.membershipOnAuthentication,
    requireScimPreProvisioning: normalized.requireScimPreProvisioning,
    requirePasswordForZk: normalized.requirePasswordForZk,
    allowPasskeyPrf: normalized.allowPasskeyPrf,
    allowTrustedDeviceApproval: normalized.allowTrustedDeviceApproval,
    allowNonZkKeySetupBypass: normalized.allowNonZkKeySetupBypass,
    domains: normalized.domains,
    enabled: normalized.enabled,
    metadata: normalized.metadata,
    updatedAt: new Date(),
  };
  if (Object.hasOwn(updates, "clientSecret")) {
    patch.clientSecretEnc = await encryptSecret(context, updates.clientSecret);
  }
  try {
    const [updated] = await context.db
      .update(federationConnections)
      .set(patch)
      .where(eq(federationConnections.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Federation connection not found");
    if (updates.domains || updates.organizationId) {
      await replaceFederationConnectionDomains(
        context,
        updated.id,
        updated.organizationId,
        normalized.domains,
        { verificationStatus: "verified" }
      );
    }
    return redactConnection(updated);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    if (isUniqueError(error)) throw new ConflictError("Federation connection already exists");
    throw error;
  }
}

export async function deleteFederationConnection(context: Context, id: string) {
  validateId(id, "connection id");
  const rows = await context.db
    .delete(federationConnections)
    .where(eq(federationConnections.id, id))
    .returning();
  if (!rows[0]) throw new NotFoundError("Federation connection not found");
  return { success: true } as const;
}

export async function listFederationConnectionsForOrganization(
  context: Context,
  organizationId: string
) {
  validateId(organizationId, "organization id");
  const rows = await context.db
    .select()
    .from(federationConnections)
    .where(eq(federationConnections.organizationId, organizationId))
    .orderBy(asc(federationConnections.name));
  return rows.map(redactConnection);
}

export async function getFederationConnectionForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  validateId(organizationId, "organization id");
  validateId(connectionId, "connection id");
  const row = await context.db.query.federationConnections.findFirst({
    where: and(
      eq(federationConnections.id, connectionId),
      eq(federationConnections.organizationId, organizationId)
    ),
  });
  if (!row) throw new NotFoundError("Federation connection not found");
  return redactConnection(row);
}

async function assertFederationConnectionInOrganization(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  validateId(organizationId, "organization id");
  validateId(connectionId, "connection id");
  const row = await context.db.query.federationConnections.findFirst({
    where: and(
      eq(federationConnections.id, connectionId),
      eq(federationConnections.organizationId, organizationId)
    ),
  });
  if (!row) throw new NotFoundError("Federation connection not found");
  return row;
}

export async function updateFederationConnectionForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string,
  updates: Partial<Parameters<typeof createFederationConnection>[1]>
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  // Never allow moving a connection to another organization through the org-scoped path.
  const { organizationId: _ignored, ...safeUpdates } = updates;
  return updateFederationConnection(context, connectionId, safeUpdates);
}

export async function deleteFederationConnectionForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  return deleteFederationConnection(context, connectionId);
}

export async function createFederationConnectionDomainForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string,
  domain: string
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  return createFederationConnectionDomain(context, { connectionId, domain });
}

export async function listFederationConnectionDomainsForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  return listFederationConnectionDomains(context, connectionId);
}

export async function deleteFederationConnectionDomainForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string,
  domainId: string
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  return deleteFederationConnectionDomain(context, connectionId, domainId);
}

export async function runFederationDomainDnsVerificationForOrganization(
  context: Context,
  organizationId: string,
  connectionId: string,
  domainId: string,
  resolveTxtImpl?: TxtResolver
) {
  await assertFederationConnectionInOrganization(context, organizationId, connectionId);
  return runFederationDomainDnsVerification(context, connectionId, domainId, resolveTxtImpl);
}

export async function findFederationConnectionForEmail(
  context: Context,
  email: string,
  options: { organizationId?: string } = {}
) {
  const domain = extractDomain(email);
  if (!domain) throw new ValidationError("Valid email is required");
  if (options.organizationId) validateId(options.organizationId, "organization id");
  const conditions = [
    eq(federationConnectionDomains.domain, domain),
    eq(federationConnectionDomains.enabled, true),
    eq(federationConnectionDomains.verificationStatus, "verified"),
    eq(federationConnections.enabled, true),
  ];
  if (options.organizationId) {
    conditions.push(eq(federationConnections.organizationId, options.organizationId));
  }
  const rows = await context.db
    .select({ connection: federationConnections })
    .from(federationConnectionDomains)
    .innerJoin(
      federationConnections,
      eq(federationConnectionDomains.connectionId, federationConnections.id)
    )
    .where(and(...conditions))
    .orderBy(asc(federationConnections.name));
  if (rows.length > 1) {
    throw new ValidationError("Multiple federation connections match this email domain");
  }
  return rows[0] ? redactConnection(rows[0].connection) : null;
}

export function mapFederationClaims(
  claims: Record<string, unknown>,
  mapping: FederationClaimMapping = DEFAULT_CLAIM_MAPPING
) {
  const subject = readMappedClaim(claims, mapping.subject || "sub");
  if (typeof subject !== "string" || !subject.trim()) {
    throw new ValidationError("Federated subject claim is required");
  }
  const email = readMappedClaim(claims, mapping.email || "email");
  const emailVerified = readMappedClaim(claims, mapping.emailVerified || "email_verified");
  const name = readMappedClaim(claims, mapping.name || "name");
  return {
    externalSubject: subject,
    email: typeof email === "string" && email.includes("@") ? email.toLowerCase() : null,
    emailVerified: emailVerified === true,
    name: typeof name === "string" ? name : null,
  };
}

export async function resolveFederatedUserForClaims(
  context: Context,
  connectionId: string,
  claims: Record<string, unknown>
) {
  const connection = await getFederationConnectionSecret(context, connectionId);
  if (!connection.enabled) throw new ValidationError("Federation connection is disabled");
  const mapped = mapFederationClaims(claims, connection.claimMapping as FederationClaimMapping);
  if (mapped.email && !(await isEmailAllowedForConnection(context, connection.id, mapped.email))) {
    return { userSub: null, linked: false, created: false };
  }
  const identity = await context.db.query.federationIdentities.findFirst({
    where: and(
      eq(federationIdentities.connectionId, connection.id),
      eq(federationIdentities.externalSubject, mapped.externalSubject)
    ),
  });
  if (identity) {
    await context.db
      .update(federationIdentities)
      .set({
        email: mapped.email,
        emailVerified: mapped.emailVerified,
        claims,
        lastLoginAt: new Date(),
      })
      .where(eq(federationIdentities.id, identity.id));
    const membership = await ensureFederationMembership(context, connection, identity.userSub);
    if (!membership) {
      return { userSub: null, identityId: identity.id, linked: true, created: false };
    }
    return { userSub: identity.userSub, identityId: identity.id, linked: true, created: false };
  }
  if (!mapped.email) return { userSub: null, linked: false, created: false };
  const user = await context.db.query.users.findFirst({
    where: eq(users.email, mapped.email),
  });
  if (!user) {
    if (
      !connection.jitProvisioning ||
      !connection.membershipOnAuthentication ||
      connection.requireScimPreProvisioning
    ) {
      return { userSub: null, linked: false, created: false };
    }
    const createdUser = await createFederatedUser(context, {
      email: mapped.email,
      name: mapped.name,
      emailVerified: mapped.emailVerified,
    });
    const createdIdentity = await linkFederationIdentity(context, {
      connectionId: connection.id,
      userSub: createdUser.sub,
      issuer: connection.issuer,
      externalSubject: mapped.externalSubject,
      email: mapped.email,
      emailVerified: mapped.emailVerified,
      claims,
    });
    const membership = await ensureFederationMembership(context, connection, createdUser.sub);
    if (!membership) {
      return { userSub: null, identityId: createdIdentity.id, linked: true, created: true };
    }
    return {
      userSub: createdUser.sub,
      identityId: createdIdentity.id,
      linked: true,
      created: true,
    };
  }
  if (connection.accountLinkingPolicy === "disabled")
    return { userSub: null, linked: false, created: false };
  if (!mapped.emailVerified) return { userSub: null, linked: false, created: false };
  const created = await linkFederationIdentity(context, {
    connectionId: connection.id,
    userSub: user.sub,
    issuer: connection.issuer,
    externalSubject: mapped.externalSubject,
    email: mapped.email,
    emailVerified: mapped.emailVerified,
    claims,
  });
  const membership = await ensureFederationMembership(context, connection, user.sub);
  if (!membership) {
    return { userSub: null, identityId: created.id, linked: true, created: true };
  }
  return { userSub: user.sub, identityId: created.id, linked: true, created: true };
}

export async function listFederationIdentitiesForUser(context: Context, userSub: string) {
  return await context.db
    .select({
      id: federationIdentities.id,
      connectionId: federationIdentities.connectionId,
      connectionName: federationConnections.name,
      issuer: federationIdentities.issuer,
      externalSubject: federationIdentities.externalSubject,
      email: federationIdentities.email,
      emailVerified: federationIdentities.emailVerified,
      linkedAt: federationIdentities.linkedAt,
      lastLoginAt: federationIdentities.lastLoginAt,
    })
    .from(federationIdentities)
    .innerJoin(
      federationConnections,
      eq(federationIdentities.connectionId, federationConnections.id)
    )
    .where(eq(federationIdentities.userSub, userSub))
    .orderBy(asc(federationConnections.name), asc(federationIdentities.linkedAt));
}

export async function decryptFederationClientSecret(context: Context, encrypted: Buffer | null) {
  if (!encrypted) return null;
  if (!context.services.kek?.isAvailable()) {
    throw new ValidationError("KEK service is required to decrypt federation client secrets");
  }
  return (await context.services.kek.decrypt(Buffer.from(encrypted))).toString("utf-8");
}

export async function linkFederationIdentity(
  context: Context,
  data: {
    connectionId: string;
    userSub: string;
    issuer: string;
    externalSubject: string;
    email?: string | null;
    emailVerified?: boolean;
    claims?: Record<string, unknown>;
  }
) {
  validateId(data.connectionId, "connection id");
  validateText(data.userSub, "userSub");
  validateText(data.issuer, "issuer");
  validateText(data.externalSubject, "externalSubject");
  try {
    const [row] = await context.db
      .insert(federationIdentities)
      .values({
        connectionId: data.connectionId,
        userSub: data.userSub,
        issuer: data.issuer,
        externalSubject: data.externalSubject,
        email: data.email ?? null,
        emailVerified: data.emailVerified ?? false,
        claims: data.claims ?? {},
        linkedAt: new Date(),
        lastLoginAt: new Date(),
      })
      .returning();
    if (!row) throw new ConflictError("Federation identity was not linked");
    return row;
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    if (isUniqueError(error)) throw new ConflictError("Federation identity already exists");
    throw error;
  }
}

export async function createOidcCallbackState(
  context: Context,
  data: {
    connectionId: string;
    organizationId: string;
    clientId: string;
    nonce: string;
    codeVerifier?: string;
    returnTo?: string | null;
    ttlSeconds?: number;
  }
) {
  validateId(data.connectionId, "connection id");
  validateId(data.organizationId, "organization id");
  validateText(data.clientId, "client id");
  validateText(data.nonce, "nonce");
  const state = generateRandomString(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, data.ttlSeconds ?? 600) * 1000);
  await context.db.insert(federationOidcStates).values({
    stateHash: sha256Base64Url(state),
    connectionId: data.connectionId,
    organizationId: data.organizationId,
    clientId: data.clientId,
    nonceHash: sha256Base64Url(data.nonce),
    codeVerifierHash: data.codeVerifier ? sha256Base64Url(data.codeVerifier) : null,
    returnTo: data.returnTo ?? null,
    createdAt: now,
    expiresAt,
    consumedAt: null,
  });
  return { state, expiresAt };
}

export async function consumeOidcCallbackState(
  context: Context,
  data: { state: string; nonce?: string; codeVerifier?: string; now?: Date }
) {
  validateText(data.state, "state");
  const now = data.now ?? new Date();
  const row = await context.db.query.federationOidcStates.findFirst({
    where: eq(federationOidcStates.stateHash, sha256Base64Url(data.state)),
  });
  if (!row || row.consumedAt || row.expiresAt <= now)
    throw new ValidationError("Invalid OIDC state");
  if (data.nonce && row.nonceHash !== sha256Base64Url(data.nonce)) {
    throw new ValidationError("Invalid OIDC nonce");
  }
  if (data.codeVerifier && row.codeVerifierHash !== sha256Base64Url(data.codeVerifier)) {
    throw new ValidationError("Invalid OIDC code verifier");
  }
  const [updated] = await context.db
    .update(federationOidcStates)
    .set({ consumedAt: now })
    .where(
      and(
        eq(federationOidcStates.stateHash, row.stateHash),
        isNull(federationOidcStates.consumedAt)
      )
    )
    .returning();
  if (!updated) throw new ValidationError("Invalid OIDC state");
  return updated;
}

type AddressLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string }>>;

export async function discoverOidcMetadata(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
  lookupImpl: AddressLookup = defaultLookup
): Promise<OidcDiscoveryMetadata> {
  const normalizedIssuer = normalizeIssuer(issuer);
  await assertPublicOidcIssuer(normalizedIssuer, lookupImpl);
  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const response = await fetchImpl(discoveryUrl, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) throw new ValidationError("OIDC discovery failed");
  const metadata = (await response.json()) as OidcDiscoveryMetadata;
  return validateOidcDiscoveryMetadata(normalizedIssuer, metadata);
}

export function validateOidcDiscoveryMetadata(
  expectedIssuer: string,
  metadata: OidcDiscoveryMetadata
) {
  const issuer = normalizeIssuer(expectedIssuer);
  if (!metadata || typeof metadata !== "object")
    throw new ValidationError("OIDC metadata is required");
  if (metadata.issuer !== issuer) throw new ValidationError("OIDC discovery issuer mismatch");
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof metadata[key] !== "string") throw new ValidationError(`OIDC ${key} is required`);
    validateProviderUrl(metadata[key], issuer, key);
  }
  if (metadata.userinfo_endpoint)
    validateProviderUrl(metadata.userinfo_endpoint, issuer, "userinfo_endpoint");
  if (
    Array.isArray(metadata.response_types_supported) &&
    !metadata.response_types_supported.includes("code")
  ) {
    throw new ValidationError("OIDC provider must support authorization code flow");
  }
  const signingAlgs = metadata.id_token_signing_alg_values_supported;
  if (Array.isArray(signingAlgs) && signingAlgs.includes("none")) {
    throw new ValidationError(
      "OIDC provider must not advertise none as an ID token signing algorithm"
    );
  }
  return metadata;
}

async function assertPublicOidcIssuer(issuer: string, lookupImpl: AddressLookup) {
  const url = new URL(issuer);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:") throw new ValidationError("issuer must use https");
  if (isLocalOnlyHostname(hostname)) throw new ValidationError("issuer host is not allowed");
  if (isBlockedAddress(hostname)) throw new ValidationError("issuer host is not allowed");
  if (isIP(hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new ValidationError("issuer host could not be resolved");
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new ValidationError("issuer host is not allowed");
  }
}

function isLocalOnlyHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    !hostname.includes(".")
  );
}

function isBlockedAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedIpv4(normalized)) return true;
  if (isIP(normalized) !== 6) return false;
  const value = parseIpv6(normalized);
  if (value === null) return true;
  return IPV6_BLOCKED_RANGES.some(([base, bits]) => isIpv6InRange(value, base, bits));
}

const IPV6_BLOCKED_RANGES = [
  [parseIpv6("::") as bigint, 96],
  [parseIpv6("::ffff:0:0") as bigint, 96],
  [parseIpv6("64:ff9b::") as bigint, 96],
  [parseIpv6("64:ff9b:1::") as bigint, 48],
  [parseIpv6("100::") as bigint, 64],
  [parseIpv6("2001::") as bigint, 23],
  [parseIpv6("2002::") as bigint, 16],
  [parseIpv6("fc00::") as bigint, 7],
  [parseIpv6("fe80::") as bigint, 10],
  [parseIpv6("ff00::") as bigint, 8],
] as const;

function isIpv6InRange(value: bigint, base: bigint, bits: number) {
  const shift = 128n - BigInt(bits);
  return value >> shift === base >> shift;
}

function parseIpv6(address: string) {
  const withoutZone = address.split("%")[0] || "";
  const expanded = expandEmbeddedIpv4(withoutZone);
  if (!expanded) return null;
  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 1 ? 0 : 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function expandEmbeddedIpv4(address: string) {
  if (!address.includes(".")) return address;
  const index = address.lastIndexOf(":");
  if (index < 0) return null;
  const ipv4 = address.slice(index + 1);
  if (isIP(ipv4) !== 4) return null;
  const parts = ipv4.split(".").map((part) => Number.parseInt(part, 10));
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  const high = (a << 8) + b;
  const low = (c << 8) + d;
  return `${address.slice(0, index)}:${high.toString(16)}:${low.toString(16)}`;
}

function isBlockedIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeConnectionInput(data: Parameters<typeof createFederationConnection>[1]) {
  const name = data.name?.trim();
  const issuer = normalizeIssuer(data.issuer);
  const metadata = data.metadata ? validateOidcDiscoveryMetadata(issuer, data.metadata) : undefined;
  const discoveryUrl = data.discoveryUrl
    ? normalizeHttpsUrl(data.discoveryUrl, "discoveryUrl")
    : `${issuer}/.well-known/openid-configuration`;
  const authorizationEndpoint = data.authorizationEndpoint ?? metadata?.authorization_endpoint;
  const tokenEndpoint = data.tokenEndpoint ?? metadata?.token_endpoint;
  const jwksUri = data.jwksUri ?? metadata?.jwks_uri;
  if (!name) throw new ValidationError("name is required");
  validateText(data.clientId, "clientId");
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new ValidationError("OIDC discovery metadata or endpoints are required");
  }
  validateProviderUrl(discoveryUrl, issuer, "discoveryUrl");
  validateProviderUrl(authorizationEndpoint, issuer, "authorizationEndpoint");
  validateProviderUrl(tokenEndpoint, issuer, "tokenEndpoint");
  validateProviderUrl(jwksUri, issuer, "jwksUri");
  const userinfoEndpoint = data.userinfoEndpoint || metadata?.userinfo_endpoint || null;
  if (userinfoEndpoint) validateProviderUrl(userinfoEndpoint, issuer, "userinfoEndpoint");
  const scopes = normalizeStringList(data.scopes, DEFAULT_SCOPES, "scopes");
  if (!scopes.includes("openid")) throw new ValidationError("OIDC scopes must include openid");
  const domains = normalizeDomains(data.domains ?? []);
  const accountLinkingPolicy = data.accountLinkingPolicy ?? "email_verified";
  if (!LINKING_POLICIES.has(accountLinkingPolicy)) {
    throw new ValidationError("Invalid account linking policy");
  }
  const metadataPolicy =
    data.metadata &&
    typeof data.metadata === "object" &&
    !Array.isArray(data.metadata) &&
    typeof data.metadata.darkauth_policy === "object" &&
    data.metadata.darkauth_policy !== null &&
    !Array.isArray(data.metadata.darkauth_policy)
      ? (data.metadata.darkauth_policy as Record<string, unknown>)
      : {};
  return {
    name,
    issuer,
    clientId: data.clientId.trim(),
    discoveryUrl,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint,
    scopes,
    claimMapping: normalizeClaimMapping(data.claimMapping),
    accountLinkingPolicy,
    jitProvisioning: normalizeBooleanPolicy(
      data.jitProvisioning,
      metadataPolicy.jitProvisioning,
      true
    ),
    membershipOnAuthentication: normalizeBooleanPolicy(
      data.membershipOnAuthentication,
      metadataPolicy.membershipOnAuthentication,
      true
    ),
    requireScimPreProvisioning: normalizeBooleanPolicy(
      data.requireScimPreProvisioning,
      metadataPolicy.requireScimPreProvisioning,
      false
    ),
    requirePasswordForZk: normalizeBooleanPolicy(
      data.requirePasswordForZk,
      metadataPolicy.requirePasswordForZk,
      false
    ),
    allowPasskeyPrf: normalizeBooleanPolicy(
      data.allowPasskeyPrf,
      metadataPolicy.allowPasskeyPrf,
      true
    ),
    allowTrustedDeviceApproval: normalizeBooleanPolicy(
      data.allowTrustedDeviceApproval,
      metadataPolicy.allowTrustedDeviceApproval,
      true
    ),
    allowNonZkKeySetupBypass: normalizeBooleanPolicy(
      data.allowNonZkKeySetupBypass,
      metadataPolicy.allowNonZkKeySetupBypass,
      false
    ),
    domains,
    enabled: data.enabled ?? true,
    metadata: metadata ?? data.metadata ?? {},
  };
}

export async function createFederationConnectionDomain(
  context: Context,
  data: {
    connectionId: string;
    domain: string;
    verificationStatus?: FederationDomainVerificationStatus;
    enabled?: boolean;
  }
) {
  validateId(data.connectionId, "connection id");
  const connection = await getFederationConnectionSecret(context, data.connectionId);
  const [domain] = normalizeDomains([data.domain]);
  if (!domain) throw new ValidationError("Valid domain is required");
  const verificationStatus = data.verificationStatus ?? "pending";
  validateDomainStatus(verificationStatus);
  if (verificationStatus === "verified" && data.enabled !== false) {
    await assertVerifiedDomainsAvailable(context, [domain], data.connectionId);
  }
  // For pending claims generate a verification token; the customer must publish
  // it as a DNS TXT record. Only the hash is stored. Pending claims do not
  // reserve the domain, so multiple connections may have a pending claim.
  const token = verificationStatus === "pending" ? generateRandomString(32) : null;
  const verificationTokenHash = token ? sha256Base64Url(token) : null;
  try {
    const [row] = await context.db
      .insert(federationConnectionDomains)
      .values({
        connectionId: connection.id,
        organizationId: connection.organizationId,
        domain,
        verificationStatus,
        verificationTokenHash,
        verifiedAt: verificationStatus === "verified" ? new Date() : null,
        enabled: data.enabled ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!row) throw new ConflictError("Federation domain was not created");
    return {
      ...row,
      verificationToken: token,
      recordName: federationDomainRecordName(domain),
      recordValue: token ? federationDomainRecordValue(token) : null,
    };
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    if (isUniqueError(error)) throw new ConflictError("Federation domain already exists");
    throw error;
  }
}

export async function listFederationConnectionDomains(context: Context, connectionId: string) {
  validateId(connectionId, "connection id");
  const rows = await context.db
    .select()
    .from(federationConnectionDomains)
    .where(eq(federationConnectionDomains.connectionId, connectionId))
    .orderBy(asc(federationConnectionDomains.domain));
  return rows.map((row) => ({
    ...row,
    recordName: federationDomainRecordName(row.domain),
    recordValue: federationDomainRecordValue("<token>"),
  }));
}

export async function deleteFederationConnectionDomain(
  context: Context,
  connectionId: string,
  domainId: string
) {
  validateId(connectionId, "connection id");
  validateId(domainId, "domain id");
  const [row] = await context.db
    .delete(federationConnectionDomains)
    .where(
      and(
        eq(federationConnectionDomains.id, domainId),
        eq(federationConnectionDomains.connectionId, connectionId)
      )
    )
    .returning();
  if (!row) throw new NotFoundError("Federation domain not found");
  return { success: true } as const;
}

// Admin override: directly mark a domain verified without a DNS lookup.
export async function verifyFederationConnectionDomain(
  context: Context,
  connectionId: string,
  domain: string
) {
  validateId(connectionId, "connection id");
  const [normalizedDomain] = normalizeDomains([domain]);
  if (!normalizedDomain) throw new ValidationError("Valid domain is required");
  await assertVerifiedDomainsAvailable(context, [normalizedDomain], connectionId);
  const [row] = await context.db
    .update(federationConnectionDomains)
    .set({
      verificationStatus: "verified",
      verifiedAt: new Date(),
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(federationConnectionDomains.connectionId, connectionId),
        eq(federationConnectionDomains.domain, normalizedDomain)
      )
    )
    .returning();
  if (!row) throw new NotFoundError("Federation domain not found");
  return row;
}

// Real DNS TXT verification. Looks up the _darkauth-verification.<domain> TXT
// records, checks the expected verification value is present, then marks the
// domain verified (respecting the one-enabled-verified-owner constraint). On
// failure the domain status is set to 'failed' and a result describing the
// failure is returned. The resolver is injectable for tests.
export async function runFederationDomainDnsVerification(
  context: Context,
  connectionId: string,
  domainId: string,
  resolveTxtImpl: TxtResolver = defaultResolveTxt
) {
  validateId(connectionId, "connection id");
  validateId(domainId, "domain id");
  const domainRow = await context.db.query.federationConnectionDomains.findFirst({
    where: and(
      eq(federationConnectionDomains.id, domainId),
      eq(federationConnectionDomains.connectionId, connectionId)
    ),
  });
  if (!domainRow) throw new NotFoundError("Federation domain not found");
  const now = new Date();
  if (domainRow.verificationStatus === "verified") {
    return { status: "verified" as const, domain: domainRow };
  }
  if (!domainRow.verificationTokenHash) {
    throw new ValidationError("Domain has no verification token");
  }
  const expectedValuePresent = await txtRecordMatchesToken(
    resolveTxtImpl,
    federationDomainRecordName(domainRow.domain),
    domainRow.verificationTokenHash
  );
  if (!expectedValuePresent) {
    const [failed] = await context.db
      .update(federationConnectionDomains)
      .set({ verificationStatus: "failed", lastCheckedAt: now, updatedAt: now })
      .where(eq(federationConnectionDomains.id, domainRow.id))
      .returning();
    return {
      status: "failed" as const,
      domain: failed || domainRow,
      reason: "DNS TXT verification record not found",
    };
  }
  await assertVerifiedDomainsAvailable(context, [domainRow.domain], connectionId);
  const [verified] = await context.db
    .update(federationConnectionDomains)
    .set({
      verificationStatus: "verified",
      verifiedAt: now,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(federationConnectionDomains.id, domainRow.id))
    .returning();
  if (!verified) throw new NotFoundError("Federation domain not found");
  return { status: "verified" as const, domain: verified };
}

async function txtRecordMatchesToken(
  resolveTxtImpl: TxtResolver,
  recordName: string,
  verificationTokenHash: string
) {
  let records: string[][];
  try {
    records = await resolveTxtImpl(recordName);
  } catch {
    return false;
  }
  for (const chunks of records) {
    const value = chunks.join("").trim();
    if (!value.startsWith(`${DOMAIN_VERIFICATION_VALUE_PREFIX}=`)) continue;
    const token = value.slice(DOMAIN_VERIFICATION_VALUE_PREFIX.length + 1).trim();
    if (token && sha256Base64Url(token) === verificationTokenHash) return true;
  }
  return false;
}

async function replaceFederationConnectionDomains(
  context: Context,
  connectionId: string,
  organizationId: string,
  domains: string[],
  options: { verificationStatus: FederationDomainVerificationStatus }
) {
  await context.db
    .delete(federationConnectionDomains)
    .where(eq(federationConnectionDomains.connectionId, connectionId));
  if (domains.length === 0) return;
  const now = new Date();
  await context.db.insert(federationConnectionDomains).values(
    domains.map((domain) => ({
      connectionId,
      organizationId,
      domain,
      verificationStatus: options.verificationStatus,
      verifiedAt: options.verificationStatus === "verified" ? now : null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

async function assertVerifiedDomainsAvailable(
  context: Context,
  domains: string[],
  connectionId?: string
) {
  if (domains.length === 0) return;
  const rows = await context.db
    .select({
      connectionId: federationConnectionDomains.connectionId,
      domain: federationConnectionDomains.domain,
    })
    .from(federationConnectionDomains)
    .where(
      and(
        eq(federationConnectionDomains.enabled, true),
        eq(federationConnectionDomains.verificationStatus, "verified")
      )
    );
  const conflict = rows.find(
    (row) => domains.includes(row.domain) && (!connectionId || row.connectionId !== connectionId)
  );
  if (conflict) throw new ConflictError("Federation domain is already verified");
}

async function resolveConnectionOrganizationId(context: Context, organizationId?: string) {
  if (organizationId) {
    validateId(organizationId, "organization id");
    const organization = await context.db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (!organization) throw new ValidationError("Organization not found");
    return organization.id;
  }
  const rows = await context.db.select().from(organizations).orderBy(asc(organizations.createdAt));
  if (rows.length === 1) return rows[0]?.id as string;
  const defaultOrganization = rows.find((row) => row.slug === "default");
  if (defaultOrganization) return defaultOrganization.id;
  throw new ValidationError("organizationId is required");
}

async function createFederatedUser(
  context: Context,
  data: { email: string; name: string | null; emailVerified: boolean }
) {
  const sub = generateRandomString(16);
  const [user] = await context.db
    .insert(users)
    .values({
      sub,
      email: data.email,
      opaqueLoginIdentity: data.email,
      name: data.name || null,
      emailVerifiedAt: data.emailVerified ? new Date() : null,
      createdAt: new Date(),
    })
    .returning();
  if (!user) throw new ConflictError("Unable to create user");
  return user;
}

async function ensureFederationMembership(
  context: Context,
  connection: typeof federationConnections.$inferSelect,
  userSub: string
) {
  const existing = await context.db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, connection.organizationId),
      eq(organizationMembers.userSub, userSub)
    ),
  });
  if (existing?.status === "active") return existing;
  if (connection.requireScimPreProvisioning || !connection.membershipOnAuthentication) return null;
  if (existing) return null;
  const [membership] = await context.db
    .insert(organizationMembers)
    .values({
      organizationId: connection.organizationId,
      userSub,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return membership || null;
}

function normalizeBooleanPolicy(
  explicit: boolean | undefined,
  metadataValue: unknown,
  fallback: boolean
) {
  if (typeof explicit === "boolean") return explicit;
  if (typeof metadataValue === "boolean") return metadataValue;
  return fallback;
}

function validateDomainStatus(status: string) {
  if (!DOMAIN_STATUSES.has(status)) throw new ValidationError("Invalid domain verification status");
}

function redactConnection<T extends typeof federationConnections.$inferSelect>(connection: T) {
  const { clientSecretEnc: _clientSecretEnc, ...rest } = connection;
  return { ...rest, hasClientSecret: !!connection.clientSecretEnc };
}

async function encryptSecret(context: Context, secret: string | null | undefined) {
  if (!secret) return null;
  const trimmed = secret.trim();
  if (!trimmed) return null;
  if (!context.services.kek?.isAvailable()) {
    throw new ValidationError("KEK service is required to store federation client secrets");
  }
  return await context.services.kek.encrypt(Buffer.from(trimmed, "utf-8"));
}

function normalizeIssuer(value: string) {
  const url = normalizeHttpsUrl(value, "issuer");
  if (new URL(url).search) throw new ValidationError("issuer must not include a query string");
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeHttpsUrl(value: string, name: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (url.username || url.password)
      throw new ValidationError(`${name} must not include credentials`);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
      throw new ValidationError(`${name} must use https`);
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${name} must be a valid URL`);
  }
}

function validateProviderUrl(value: string, issuer: string, name: string) {
  const normalized = normalizeHttpsUrl(value, name);
  const issuerUrl = new URL(issuer);
  const url = new URL(normalized);
  if (url.hostname.toLowerCase() !== issuerUrl.hostname.toLowerCase()) {
    throw new ValidationError(`${name} must use the issuer host`);
  }
}

function normalizeStringList(values: string[] | undefined, fallback: string[], name: string) {
  const source = values && values.length > 0 ? values : fallback;
  const normalized = [...new Set(source.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new ValidationError(`${name} is required`);
  return normalized;
}

function normalizeDomains(domains: string[]) {
  return [
    ...new Set(
      domains
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
        .filter((domain) => {
          if (!domain || domain.length > 253) return false;
          if (domain.includes("..")) return false;
          return /^[a-z0-9.-]+$/.test(domain) && domain.includes(".");
        })
    ),
  ];
}

function normalizeClaimMapping(mapping: FederationClaimMapping | undefined) {
  const next = { ...DEFAULT_CLAIM_MAPPING, ...(mapping ?? {}) };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new ValidationError(`Invalid claim mapping for ${key}`);
    }
  }
  return next;
}

function readMappedClaim(claims: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, claims);
}

function extractDomain(email: string) {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

async function isEmailAllowedForConnection(context: Context, connectionId: string, email: string) {
  const domain = extractDomain(email);
  if (!domain) return false;
  const rows = await context.db
    .select({ domain: federationConnectionDomains.domain })
    .from(federationConnectionDomains)
    .where(
      and(
        eq(federationConnectionDomains.connectionId, connectionId),
        eq(federationConnectionDomains.enabled, true),
        eq(federationConnectionDomains.verificationStatus, "verified")
      )
    );
  if (rows.length === 0) return true;
  return rows.some((row) => row.domain === domain);
}

function validateText(value: string | undefined | null, name: string) {
  if (!value || !value.trim()) throw new ValidationError(`${name} is required`);
}

function validateId(value: string, name: string) {
  validateText(value, name);
}

function isUniqueError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    ("code" in error || "cause" in error) &&
    JSON.stringify(error).includes("unique")
  );
}
