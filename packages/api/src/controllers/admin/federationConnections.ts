import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  createFederationConnection,
  createFederationConnectionDomain,
  deleteFederationConnection,
  deleteFederationConnectionDomain,
  discoverOidcMetadata,
  findFederationConnectionForEmail,
  getFederationConnection,
  listFederationConnectionDomains,
  listFederationConnections,
  runFederationDomainDnsVerification,
  updateFederationConnection,
} from "../../models/federation.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson, sendJsonValidated } from "../../utils/http.ts";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.ts";

const ClaimMappingSchema = z
  .object({
    subject: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    emailVerified: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    groups: z.string().min(1).optional(),
  })
  .optional();

const OidcMetadataSchema = z
  .object({
    issuer: z.string().url(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    jwks_uri: z.string().url(),
    userinfo_endpoint: z.string().url().optional(),
    response_types_supported: z.array(z.string()).optional(),
    subject_types_supported: z.array(z.string()).optional(),
    id_token_signing_alg_values_supported: z.array(z.string()).optional(),
    scopes_supported: z.array(z.string()).optional(),
    claims_supported: z.array(z.string()).optional(),
  })
  .passthrough();

const ConnectionRequestSchema = z.object({
  organizationId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  issuer: z.string().url(),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().min(1).nullable().optional(),
  discoveryUrl: z.string().url().optional(),
  metadata: OidcMetadataSchema.optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  userinfoEndpoint: z.string().url().nullable().optional(),
  scopes: z.array(z.string().min(1)).optional(),
  claimMapping: ClaimMappingSchema,
  accountLinkingPolicy: z.enum(["disabled", "email_verified"]).optional(),
  jitProvisioning: z.boolean().optional(),
  membershipOnAuthentication: z.boolean().optional(),
  requireScimPreProvisioning: z.boolean().optional(),
  requirePasswordForZk: z.boolean().optional(),
  allowPasskeyPrf: z.boolean().optional(),
  allowTrustedDeviceApproval: z.boolean().optional(),
  allowNonZkKeySetupBypass: z.boolean().optional(),
  domains: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional(),
});

const ConnectionUpdateSchema = ConnectionRequestSchema.partial();

const ConnectionResponseSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("oidc"),
  protocol: z.string(),
  organizationId: z.string().uuid(),
  name: z.string(),
  issuer: z.string(),
  clientId: z.string(),
  discoveryUrl: z.string(),
  authorizationEndpoint: z.string(),
  tokenEndpoint: z.string(),
  jwksUri: z.string(),
  userinfoEndpoint: z.string().nullable(),
  scopes: z.array(z.string()),
  claimMapping: z.record(z.string(), z.unknown()),
  accountLinkingPolicy: z.enum(["disabled", "email_verified", "email"]),
  jitProvisioning: z.boolean(),
  membershipOnAuthentication: z.boolean(),
  requireScimPreProvisioning: z.boolean(),
  requirePasswordForZk: z.boolean(),
  allowPasskeyPrf: z.boolean(),
  allowTrustedDeviceApproval: z.boolean(),
  allowNonZkKeySetupBypass: z.boolean(),
  domains: z.array(z.string()),
  enabled: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  hasClientSecret: z.boolean(),
});

const ListResponseSchema = z.object({
  connections: z.array(ConnectionResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

const DomainRouteResponseSchema = z.object({
  connection: ConnectionResponseSchema.nullable(),
});

async function requireAdmin(context: Context, request: IncomingMessage, write = false) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");
  if (write && session.adminRole !== "write") throw new ForbiddenError("Write access required");
}

function federationAuditContext(responseData: unknown, fallbackConnectionId?: string) {
  const record =
    responseData && typeof responseData === "object"
      ? (responseData as { id?: unknown; organizationId?: unknown })
      : undefined;
  const connectionId =
    typeof record?.id === "string" ? record.id : fallbackConnectionId || undefined;
  const organizationId =
    typeof record?.organizationId === "string" ? record.organizationId : undefined;
  if (!connectionId && !organizationId) return undefined;
  return {
    organizationId,
    enterpriseConnectionId: connectionId,
    enterpriseConnectionType: "federation",
  };
}

export async function getFederationConnections(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireAdmin(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    enabled: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "name", "issuer"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const result = await listFederationConnections(context, parsed);
  sendJsonValidated(response, 200, result, ListResponseSchema);
}

async function postFederationConnectionHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireAdmin(context, request, true);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = ConnectionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const created = await createFederationConnection(context, parsed.data);
  sendJsonValidated(response, 201, created, ConnectionResponseSchema);
}

export const postFederationConnection = withAudit({
  eventType: "FEDERATION_CONNECTION_CREATE",
  resourceType: "federation_connection",
  extractResourceId: (body: unknown) =>
    body && typeof body === "object" ? (body as { issuer?: string }).issuer : undefined,
  extractAuditContext: (_body, responseData) => federationAuditContext(responseData),
})(postFederationConnectionHandler);

export async function getFederationConnectionController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  id: string
) {
  await requireAdmin(context, request);
  const connection = await getFederationConnection(context, id);
  sendJsonValidated(response, 200, connection, ConnectionResponseSchema);
}

async function putFederationConnectionHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  id: string
) {
  await requireAdmin(context, request, true);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = ConnectionUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const updated = await updateFederationConnection(context, id, parsed.data);
  sendJsonValidated(response, 200, updated, ConnectionResponseSchema);
}

export const putFederationConnection = withAudit({
  eventType: "FEDERATION_CONNECTION_UPDATE",
  resourceType: "federation_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  extractAuditContext: (_body, responseData, params) =>
    federationAuditContext(responseData, params[0]),
})(putFederationConnectionHandler);

async function deleteFederationConnectionHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  id: string
) {
  await requireAdmin(context, request, true);
  const result = await deleteFederationConnection(context, id);
  sendJson(response, 200, result);
}

export const deleteFederationConnectionController = withAudit({
  eventType: "FEDERATION_CONNECTION_DELETE",
  resourceType: "federation_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  extractAuditContext: (_body, responseData, params) =>
    federationAuditContext(responseData, params[0]),
  skipBodyCapture: true,
})(deleteFederationConnectionHandler);

const DomainResponseSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  verificationStatus: z.enum(["pending", "verified", "failed"]),
  recordName: z.string(),
  recordValue: z.string().nullable(),
});

const DomainListResponseSchema = z.object({
  domains: z.array(
    z.object({
      id: z.string().uuid(),
      domain: z.string(),
      verificationStatus: z.enum(["pending", "verified", "failed"]),
      verifiedAt: z.date().or(z.string()).nullable(),
      lastCheckedAt: z.date().or(z.string()).nullable(),
      enabled: z.boolean(),
      recordName: z.string(),
    })
  ),
});

const DomainVerifyResponseSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  verificationStatus: z.enum(["pending", "verified", "failed"]),
  lastCheckedAt: z.date().or(z.string()).nullable(),
});

export async function getFederationConnectionDomains(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string
) {
  await requireAdmin(context, request);
  await getFederationConnection(context, connectionId);
  const domains = await listFederationConnectionDomains(context, connectionId);
  sendJsonValidated(
    response,
    200,
    {
      domains: domains.map((domain) => ({
        id: domain.id,
        domain: domain.domain,
        verificationStatus: domain.verificationStatus,
        verifiedAt: domain.verifiedAt,
        lastCheckedAt: domain.lastCheckedAt,
        enabled: domain.enabled,
        recordName: domain.recordName,
      })),
    },
    DomainListResponseSchema
  );
}

async function postFederationConnectionDomainHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string
) {
  await requireAdmin(context, request, true);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = z.object({ domain: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const created = await createFederationConnectionDomain(context, {
    connectionId,
    domain: parsed.data.domain,
  });
  sendJsonValidated(
    response,
    201,
    {
      id: created.id,
      domain: created.domain,
      verificationStatus: created.verificationStatus,
      recordName: created.recordName,
      recordValue: created.recordValue,
    },
    DomainResponseSchema
  );
}

export const postFederationConnectionDomain = withAudit({
  eventType: "FEDERATION_DOMAIN_CREATE",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
  extractAuditContext: (_body, responseData, params) => ({
    enterpriseConnectionId: params[0],
    enterpriseConnectionType: "federation",
    organizationId:
      responseData && typeof responseData === "object"
        ? (responseData as { organizationId?: string }).organizationId
        : undefined,
  }),
})(postFederationConnectionDomainHandler);

async function deleteFederationConnectionDomainHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string,
  domainId: string
) {
  await requireAdmin(context, request, true);
  const result = await deleteFederationConnectionDomain(context, connectionId, domainId);
  sendJson(response, 200, result);
}

export const deleteFederationConnectionDomainController = withAudit({
  eventType: "FEDERATION_DOMAIN_DELETE",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) => ({
    enterpriseConnectionId: params[0],
    enterpriseConnectionType: "federation",
  }),
  skipBodyCapture: true,
})(deleteFederationConnectionDomainHandler);

async function verifyFederationConnectionDomainHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string,
  domainId: string
) {
  await requireAdmin(context, request, true);
  const result = await runFederationDomainDnsVerification(context, connectionId, domainId);
  sendJsonValidated(
    response,
    200,
    {
      id: result.domain.id,
      domain: result.domain.domain,
      verificationStatus: result.domain.verificationStatus,
      lastCheckedAt: result.domain.lastCheckedAt,
    },
    DomainVerifyResponseSchema
  );
}

export const verifyFederationConnectionDomainController = withAudit({
  eventType: "FEDERATION_DOMAIN_VERIFY",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) => ({
    enterpriseConnectionId: params[0],
    enterpriseConnectionType: "federation",
  }),
  skipBodyCapture: true,
})(verifyFederationConnectionDomainHandler);

export async function getFederationDomainRoute(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireAdmin(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const email = url.searchParams.get("email");
  if (!email) throw new ValidationError("email is required");
  const organizationId = url.searchParams.get("organization_id") || undefined;
  const connection = await findFederationConnectionForEmail(context, email, { organizationId });
  sendJsonValidated(response, 200, { connection }, DomainRouteResponseSchema);
}

export async function getFederationOidcDiscovery(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireAdmin(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const issuer = url.searchParams.get("issuer");
  if (!issuer) throw new ValidationError("issuer is required");
  const metadata = await discoverOidcMetadata(issuer);
  sendJsonValidated(response, 200, metadata, OidcMetadataSchema);
}

export const listSchema = {
  method: "GET",
  path: "/admin/federation/connections",
  tags: ["Federation"],
  summary: "List federation connections",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    enabled: z.enum(["true", "false"]).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "name", "issuer"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const createSchema = {
  method: "POST",
  path: "/admin/federation/connections",
  tags: ["Federation"],
  summary: "Create federation connection",
  body: {
    contentType: "application/json",
    schema: ConnectionRequestSchema,
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ConnectionResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const getSchema = {
  method: "GET",
  path: "/admin/federation/connections/{id}",
  tags: ["Federation"],
  summary: "Get federation connection",
  params: z.object({ id: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ConnectionResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const updateSchema = {
  method: "PUT",
  path: "/admin/federation/connections/{id}",
  tags: ["Federation"],
  summary: "Update federation connection",
  params: z.object({ id: z.string().uuid() }),
  body: {
    contentType: "application/json",
    schema: ConnectionUpdateSchema,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ConnectionResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteSchema = {
  method: "DELETE",
  path: "/admin/federation/connections/{id}",
  tags: ["Federation"],
  summary: "Delete federation connection",
  params: z.object({ id: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
