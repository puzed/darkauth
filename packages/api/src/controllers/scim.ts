import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { NotFoundError } from "../errors.ts";
import { withRateLimit } from "../middleware/rateLimit.ts";
import {
  createScimGroup,
  createScimUser,
  deactivateScimUser,
  deleteScimGroup,
  getScimGroup,
  getScimUser,
  listScimGroups,
  listScimUsers,
  patchScimGroup,
  patchScimUser,
  replaceScimUser,
  requireScimBearerToken,
} from "../models/scim.ts";
import { getClientIp, logAuditEvent } from "../services/audit.ts";
import type { Context } from "../types.ts";
import { parseAuthorizationHeader, parseJsonSafely, readBody, sendJson } from "../utils/http.ts";

const PatchSchema = z.object({
  schemas: z.array(z.string()).optional(),
  Operations: z.array(
    z.object({
      op: z.string().optional(),
      path: z.string().optional(),
      value: z.unknown().optional(),
    })
  ),
});

async function requireBearer(context: Context, request: IncomingMessage) {
  const auth = parseAuthorizationHeader(request);
  return await requireScimBearerToken(
    context,
    auth?.type.toLowerCase() === "bearer" ? auth.credentials : null
  );
}

type ScimAuditResource = Record<string, unknown> & {
  id?: string;
  userName?: string;
  displayName?: string;
  externalId?: string;
  active?: boolean;
  members?: unknown[];
};

async function auditScimEvent(
  context: Context,
  request: IncomingMessage,
  data: {
    eventType: string;
    resourceType: string;
    resourceId?: string;
    tokenId?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
  }
) {
  const userAgent = request.headers["user-agent"];
  await logAuditEvent(context, {
    eventType: data.eventType,
    method: request.method || "UNKNOWN",
    path: request.url || "/",
    cohort: "scim",
    ipAddress: getClientIp(request),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    success: true,
    statusCode: data.statusCode ?? 200,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    action: (request.method || "UNKNOWN").toLowerCase(),
    details: { token_id: data.tokenId, ...(data.details ?? {}) },
  });
}

function scimUserAuditDetails(action: string, resource: ScimAuditResource) {
  return {
    action,
    user_name: typeof resource.userName === "string" ? resource.userName : undefined,
    external_id: typeof resource.externalId === "string" ? resource.externalId : undefined,
    active: typeof resource.active === "boolean" ? resource.active : undefined,
  };
}

function scimGroupAuditDetails(action: string, resource: ScimAuditResource) {
  return {
    action,
    display_name: typeof resource.displayName === "string" ? resource.displayName : undefined,
    external_id: typeof resource.externalId === "string" ? resource.externalId : undefined,
    member_count: Array.isArray(resource.members) ? resource.members.length : undefined,
  };
}

function query(request: IncomingMessage) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  return {
    startIndex: Number(url.searchParams.get("startIndex") || "1"),
    count: Number(url.searchParams.get("count") || "100"),
    filter: url.searchParams.get("filter"),
  };
}

function staticScimResponse(pathname: string) {
  if (pathname === "/scim/v2/ServiceProviderConfig") {
    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "Bearer",
          description: "Bearer token",
          specUri: "https://www.rfc-editor.org/rfc/rfc6750",
          primary: true,
        },
      ],
    };
  }
  if (pathname === "/scim/v2/ResourceTypes") {
    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        {
          id: "User",
          name: "User",
          endpoint: "/Users",
          schema: "urn:ietf:params:scim:schemas:core:2.0:User",
        },
        {
          id: "Group",
          name: "Group",
          endpoint: "/Groups",
          schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
        },
      ],
    };
  }
  if (pathname === "/scim/v2/Schemas") {
    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        { id: "urn:ietf:params:scim:schemas:core:2.0:User", name: "User" },
        { id: "urn:ietf:params:scim:schemas:core:2.0:Group", name: "Group" },
      ],
    };
  }
  return null;
}

export async function handleScim(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const bearer = await requireBearer(context, request);
  const method = request.method || "GET";
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const pathname = url.pathname;
  const staticResponse = staticScimResponse(pathname);
  if (method === "GET" && staticResponse) return sendJson(response, 200, staticResponse);

  if (pathname === "/scim/v2/Users") {
    if (method === "GET")
      return sendJson(response, 200, await listScimUsers(context, query(request)));
    if (method === "POST") {
      const body = parseJsonSafely(await readBody(request));
      const resource = await createScimUser(context, body as Record<string, unknown>);
      await auditScimEvent(context, request, {
        eventType: "SCIM_USER_CREATE",
        resourceType: "scim_user",
        resourceId: resource.id,
        tokenId: bearer.id,
        statusCode: 201,
        details: scimUserAuditDetails("create", resource),
      });
      return sendJson(response, 201, resource);
    }
  }

  const userMatch = pathname.match(/^\/scim\/v2\/Users\/([^/]+)$/);
  if (userMatch) {
    const userSub = decodeURIComponent(userMatch[1] as string);
    if (method === "GET") return sendJson(response, 200, await getScimUser(context, userSub));
    if (method === "PUT") {
      const body = parseJsonSafely(await readBody(request));
      const resource = await replaceScimUser(context, userSub, body as Record<string, unknown>);
      await auditScimEvent(context, request, {
        eventType: "SCIM_USER_UPDATE",
        resourceType: "scim_user",
        resourceId: resource.id,
        tokenId: bearer.id,
        details: scimUserAuditDetails("update", resource),
      });
      return sendJson(response, 200, resource);
    }
    if (method === "PATCH") {
      const parsed = PatchSchema.parse(parseJsonSafely(await readBody(request)));
      const resource = await patchScimUser(context, userSub, parsed.Operations);
      await auditScimEvent(context, request, {
        eventType: "SCIM_USER_PATCH",
        resourceType: "scim_user",
        resourceId: resource.id,
        tokenId: bearer.id,
        details: scimUserAuditDetails("patch", resource),
      });
      return sendJson(response, 200, resource);
    }
    if (method === "DELETE") {
      const resource = await deactivateScimUser(context, userSub);
      await auditScimEvent(context, request, {
        eventType: "SCIM_USER_DEACTIVATE",
        resourceType: "scim_user",
        resourceId: resource.id,
        tokenId: bearer.id,
        details: scimUserAuditDetails("deactivate", resource),
      });
      return sendJson(response, 200, resource);
    }
  }

  if (pathname === "/scim/v2/Groups") {
    if (method === "GET")
      return sendJson(response, 200, await listScimGroups(context, query(request)));
    if (method === "POST") {
      const body = parseJsonSafely(await readBody(request));
      const resource = await createScimGroup(context, body as Record<string, unknown>);
      await auditScimEvent(context, request, {
        eventType: "SCIM_GROUP_CREATE",
        resourceType: "scim_group",
        resourceId: resource.id,
        tokenId: bearer.id,
        statusCode: 201,
        details: scimGroupAuditDetails("create", resource),
      });
      return sendJson(response, 201, resource);
    }
  }

  const groupMatch = pathname.match(/^\/scim\/v2\/Groups\/([^/]+)$/);
  if (groupMatch) {
    const groupId = decodeURIComponent(groupMatch[1] as string);
    if (method === "GET") return sendJson(response, 200, await getScimGroup(context, groupId));
    if (method === "PATCH") {
      const parsed = PatchSchema.parse(parseJsonSafely(await readBody(request)));
      const resource = await patchScimGroup(context, groupId, parsed.Operations);
      await auditScimEvent(context, request, {
        eventType: "SCIM_GROUP_PATCH",
        resourceType: "scim_group",
        resourceId: resource.id,
        tokenId: bearer.id,
        details: scimGroupAuditDetails("patch", resource),
      });
      return sendJson(response, 200, resource);
    }
    if (method === "DELETE") {
      const resource = await getScimGroup(context, groupId);
      const result = await deleteScimGroup(context, groupId);
      await auditScimEvent(context, request, {
        eventType: "SCIM_GROUP_DELETE",
        resourceType: "scim_group",
        resourceId: resource.id,
        tokenId: bearer.id,
        details: scimGroupAuditDetails("delete", resource),
      });
      return sendJson(response, 200, result);
    }
  }

  throw new NotFoundError("SCIM resource not found");
}

export const handleScimRateLimited = withRateLimit("scim")(handleScim);
