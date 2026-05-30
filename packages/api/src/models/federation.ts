import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import {
  federationConnections,
  federationIdentities,
  federationOidcStates,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { createUser } from "./users.ts";

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
    domains?: string[];
    enabled?: boolean;
  }
) {
  const now = new Date();
  const normalized = normalizeConnectionInput(data);
  const clientSecretEnc = await encryptSecret(context, data.clientSecret);
  const row = {
    type: "oidc",
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
    domains: normalized.domains,
    enabled: normalized.enabled,
    metadata: normalized.metadata,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof federationConnections.$inferInsert;
  try {
    const [created] = await context.db.insert(federationConnections).values(row).returning();
    if (!created) throw new ConflictError("Federation connection was not created");
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
  const merged = {
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
    domains: updates.domains ?? existing.domains,
    enabled: updates.enabled ?? existing.enabled,
  };
  const normalized = normalizeConnectionInput(merged);
  const patch: Partial<typeof federationConnections.$inferInsert> = {
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

export async function findFederationConnectionForEmail(context: Context, email: string) {
  const domain = extractDomain(email);
  if (!domain) throw new ValidationError("Valid email is required");
  const rows = await context.db
    .select()
    .from(federationConnections)
    .where(eq(federationConnections.enabled, true))
    .orderBy(asc(federationConnections.name));
  const match = rows.find((row) => row.domains.includes(domain));
  return match ? redactConnection(match) : null;
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
  if (mapped.email && !isEmailAllowedForConnection(mapped.email, connection.domains)) {
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
    return { userSub: identity.userSub, identityId: identity.id, linked: true, created: false };
  }
  if (connection.accountLinkingPolicy === "disabled")
    return { userSub: null, linked: false, created: false };
  if (!mapped.email) return { userSub: null, linked: false, created: false };
  if (!mapped.emailVerified) return { userSub: null, linked: false, created: false };
  const user = await context.db.query.users.findFirst({
    where: eq(users.email, mapped.email),
  });
  if (!user) {
    const createdUser = await createUser(context, {
      email: mapped.email,
      name: mapped.name || undefined,
    });
    if (mapped.emailVerified) {
      await context.db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.sub, createdUser.sub));
    }
    const createdIdentity = await linkFederationIdentity(context, {
      connectionId: connection.id,
      userSub: createdUser.sub,
      issuer: connection.issuer,
      externalSubject: mapped.externalSubject,
      email: mapped.email,
      emailVerified: mapped.emailVerified,
      claims,
    });
    return {
      userSub: createdUser.sub,
      identityId: createdIdentity.id,
      linked: true,
      created: true,
    };
  }
  const created = await linkFederationIdentity(context, {
    connectionId: connection.id,
    userSub: user.sub,
    issuer: connection.issuer,
    externalSubject: mapped.externalSubject,
    email: mapped.email,
    emailVerified: mapped.emailVerified,
    claims,
  });
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
    nonce: string;
    codeVerifier?: string;
    returnTo?: string | null;
    ttlSeconds?: number;
  }
) {
  validateId(data.connectionId, "connection id");
  validateText(data.nonce, "nonce");
  const state = generateRandomString(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, data.ttlSeconds ?? 600) * 1000);
  await context.db.insert(federationOidcStates).values({
    stateHash: sha256Base64Url(state),
    connectionId: data.connectionId,
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
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf)
  );
}

function isBlockedIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
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
    domains,
    enabled: data.enabled ?? true,
    metadata: metadata ?? data.metadata ?? {},
  };
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
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeHttpsUrl(value: string, name: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
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

function isEmailAllowedForConnection(email: string, domains: string[]) {
  if (!domains || domains.length === 0) return true;
  const domain = extractDomain(email);
  return !!domain && domains.includes(domain);
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
