import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import {
  createFederationConnection,
  createFederationConnectionDomainForOrganization,
  deleteFederationConnectionDomainForOrganization,
  deleteFederationConnectionForOrganization,
  getFederationConnectionForOrganization,
  listFederationConnectionDomainsForOrganization,
  listFederationConnectionsForOrganization,
  runFederationDomainDnsVerificationForOrganization,
  updateFederationConnectionForOrganization,
} from "../../models/federation.ts";
import { requireOrganizationManagePermission } from "../../models/organizations.ts";
import {
  createScimBearerTokenForConnection,
  createScimConnection,
  deleteScimConnectionForOrg,
  getScimConnectionForOrg,
  listScimBearerTokensForConnection,
  listScimConnectionsForOrganization,
  revokeScimBearerTokenForConnection,
  updateScimConnectionForOrg,
} from "../../models/scim.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const ClaimMappingSchema = z
  .object({
    subject: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    emailVerified: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    groups: z.string().min(1).optional(),
  })
  .optional();

const FederationConnectionRequestSchema = z.object({
  name: z.string().min(1).max(255),
  issuer: z.string().url(),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().min(1).nullable().optional(),
  discoveryUrl: z.string().url().optional(),
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
  enabled: z.boolean().optional(),
});

const FederationConnectionUpdateSchema = FederationConnectionRequestSchema.partial();

function enterpriseAuditContext(
  organizationId: string,
  enterpriseConnectionType: "federation" | "scim",
  enterpriseConnectionId?: string
) {
  return { organizationId, enterpriseConnectionId, enterpriseConnectionType };
}

// Federation / SSO

export async function getOrganizationFederationConnections(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const connections = await listFederationConnectionsForOrganization(context, orgId);
  sendJson(response, 200, { connections });
}

export const postOrganizationFederationConnection = withAudit({
  eventType: "USER_ORG_FEDERATION_CONNECTION_CREATE",
  resourceType: "federation_connection",
  extractAuditContext: (_body, responseData, params) =>
    enterpriseAuditContext(
      params[0] as string,
      "federation",
      responseData && typeof responseData === "object"
        ? (responseData as { connection?: { id?: string } }).connection?.id
        : undefined
    ),
})(async function postOrganizationFederationConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = FederationConnectionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const connection = await createFederationConnection(context, {
    ...parsed.data,
    organizationId: orgId,
  });
  sendJson(response, 201, { connection });
});

export async function getOrganizationFederationConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const connection = await getFederationConnectionForOrganization(context, orgId, connectionId);
  sendJson(response, 200, { connection });
}

export const putOrganizationFederationConnection = withAudit({
  eventType: "USER_ORG_FEDERATION_CONNECTION_UPDATE",
  resourceType: "federation_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "federation", params[1]),
})(async function putOrganizationFederationConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = FederationConnectionUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const connection = await updateFederationConnectionForOrganization(
    context,
    orgId,
    connectionId,
    parsed.data
  );
  sendJson(response, 200, { connection });
});

export const deleteOrganizationFederationConnection = withAudit({
  eventType: "USER_ORG_FEDERATION_CONNECTION_DELETE",
  resourceType: "federation_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "federation", params[1]),
  skipBodyCapture: true,
})(async function deleteOrganizationFederationConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const result = await deleteFederationConnectionForOrganization(context, orgId, connectionId);
  sendJson(response, 200, result);
});

export async function getOrganizationFederationDomains(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const domains = await listFederationConnectionDomainsForOrganization(
    context,
    orgId,
    connectionId
  );
  sendJson(response, 200, {
    domains: domains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      verificationStatus: domain.verificationStatus,
      verifiedAt: domain.verifiedAt,
      lastCheckedAt: domain.lastCheckedAt,
      enabled: domain.enabled,
      recordName: domain.recordName,
    })),
  });
}

export const postOrganizationFederationDomain = withAudit({
  eventType: "USER_ORG_FEDERATION_DOMAIN_CREATE",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "federation", params[1]),
})(async function postOrganizationFederationDomain(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = z.object({ domain: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const created = await createFederationConnectionDomainForOrganization(
    context,
    orgId,
    connectionId,
    parsed.data.domain
  );
  sendJson(response, 201, {
    id: created.id,
    domain: created.domain,
    verificationStatus: created.verificationStatus,
    recordName: created.recordName,
    recordValue: created.recordValue,
  });
});

export const deleteOrganizationFederationDomain = withAudit({
  eventType: "USER_ORG_FEDERATION_DOMAIN_DELETE",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[2],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "federation", params[1]),
  skipBodyCapture: true,
})(async function deleteOrganizationFederationDomain(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string,
  domainId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const result = await deleteFederationConnectionDomainForOrganization(
    context,
    orgId,
    connectionId,
    domainId
  );
  sendJson(response, 200, result);
});

export const postOrganizationFederationDomainVerify = withAudit({
  eventType: "USER_ORG_FEDERATION_DOMAIN_VERIFY",
  resourceType: "federation_connection_domain",
  extractResourceId: (_body: unknown, params: string[]) => params[2],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "federation", params[1]),
  skipBodyCapture: true,
})(async function postOrganizationFederationDomainVerify(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string,
  domainId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const result = await runFederationDomainDnsVerificationForOrganization(
    context,
    orgId,
    connectionId,
    domainId
  );
  sendJson(response, 200, {
    id: result.domain.id,
    domain: result.domain.domain,
    verificationStatus: result.domain.verificationStatus,
    lastCheckedAt: result.domain.lastCheckedAt,
  });
});

// SCIM

export async function getOrganizationScimConnections(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const connections = await listScimConnectionsForOrganization(context, orgId);
  sendJson(response, 200, { connections });
}

export const postOrganizationScimConnection = withAudit({
  eventType: "USER_ORG_SCIM_CONNECTION_CREATE",
  resourceType: "scim_connection",
  extractAuditContext: (_body, responseData, params) =>
    enterpriseAuditContext(
      params[0] as string,
      "scim",
      responseData && typeof responseData === "object"
        ? (responseData as { connection?: { id?: string } }).connection?.id
        : undefined
    ),
})(async function postOrganizationScimConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = z.object({ name: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const connection = await createScimConnection(context, {
    organizationId: orgId,
    name: parsed.data.name,
  });
  sendJson(response, 201, { connection });
});

export async function getOrganizationScimConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const connection = await getScimConnectionForOrg(context, orgId, connectionId);
  sendJson(response, 200, { connection });
}

export const putOrganizationScimConnection = withAudit({
  eventType: "USER_ORG_SCIM_CONNECTION_UPDATE",
  resourceType: "scim_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "scim", params[1]),
})(async function putOrganizationScimConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      enabled: z.boolean().optional(),
      deprovisionAction: z
        .enum(["suspend_membership", "remove_membership", "delete_user"])
        .optional(),
      deleteUserSafety: z.enum(["fail_closed", "suspend_membership"]).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const connection = await updateScimConnectionForOrg(context, orgId, connectionId, parsed.data);
  sendJson(response, 200, { connection });
});

export const deleteOrganizationScimConnection = withAudit({
  eventType: "USER_ORG_SCIM_CONNECTION_DELETE",
  resourceType: "scim_connection",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "scim", params[1]),
  skipBodyCapture: true,
})(async function deleteOrganizationScimConnection(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const result = await deleteScimConnectionForOrg(context, orgId, connectionId);
  sendJson(response, 200, result);
});

export async function getOrganizationScimTokens(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const tokens = await listScimBearerTokensForConnection(context, orgId, connectionId);
  sendJson(response, 200, { tokens });
}

export const postOrganizationScimToken = withAudit({
  eventType: "USER_ORG_SCIM_TOKEN_CREATE",
  resourceType: "scim_token",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "scim", params[1]),
})(async function postOrganizationScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const raw = parseJsonSafely(await readBody(request));
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation error", parsed.error.issues);
  const token = await createScimBearerTokenForConnection(context, orgId, connectionId, {
    name: parsed.data.name,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  sendJson(response, 201, token);
});

export const deleteOrganizationScimToken = withAudit({
  eventType: "USER_ORG_SCIM_TOKEN_REVOKE",
  resourceType: "scim_token",
  extractResourceId: (_body: unknown, params: string[]) => params[2],
  extractAuditContext: (_body, _responseData, params) =>
    enterpriseAuditContext(params[0] as string, "scim", params[1]),
  skipBodyCapture: true,
})(async function deleteOrganizationScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  orgId: string,
  connectionId: string,
  tokenId: string
) {
  const session = await requireSession(context, request, false);
  await requireOrganizationManagePermission(context, session.sub as string, orgId);
  const result = await revokeScimBearerTokenForConnection(context, orgId, connectionId, tokenId);
  sendJson(response, 200, result);
});
