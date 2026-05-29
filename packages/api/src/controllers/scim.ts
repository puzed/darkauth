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
  await requireScimBearerToken(
    context,
    auth?.type.toLowerCase() === "bearer" ? auth.credentials : null
  );
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
  await requireBearer(context, request);
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
      return sendJson(
        response,
        201,
        await createScimUser(context, body as Record<string, unknown>)
      );
    }
  }

  const userMatch = pathname.match(/^\/scim\/v2\/Users\/([^/]+)$/);
  if (userMatch) {
    const userSub = decodeURIComponent(userMatch[1] as string);
    if (method === "GET") return sendJson(response, 200, await getScimUser(context, userSub));
    if (method === "PUT") {
      const body = parseJsonSafely(await readBody(request));
      return sendJson(
        response,
        200,
        await replaceScimUser(context, userSub, body as Record<string, unknown>)
      );
    }
    if (method === "PATCH") {
      const parsed = PatchSchema.parse(parseJsonSafely(await readBody(request)));
      return sendJson(response, 200, await patchScimUser(context, userSub, parsed.Operations));
    }
    if (method === "DELETE")
      return sendJson(response, 200, await deactivateScimUser(context, userSub));
  }

  if (pathname === "/scim/v2/Groups") {
    if (method === "GET")
      return sendJson(response, 200, await listScimGroups(context, query(request)));
    if (method === "POST") {
      const body = parseJsonSafely(await readBody(request));
      return sendJson(
        response,
        201,
        await createScimGroup(context, body as Record<string, unknown>)
      );
    }
  }

  const groupMatch = pathname.match(/^\/scim\/v2\/Groups\/([^/]+)$/);
  if (groupMatch) {
    const groupId = decodeURIComponent(groupMatch[1] as string);
    if (method === "GET") return sendJson(response, 200, await getScimGroup(context, groupId));
    if (method === "PATCH") {
      const parsed = PatchSchema.parse(parseJsonSafely(await readBody(request)));
      return sendJson(response, 200, await patchScimGroup(context, groupId, parsed.Operations));
    }
    if (method === "DELETE")
      return sendJson(response, 200, await deleteScimGroup(context, groupId));
  }

  throw new NotFoundError("SCIM resource not found");
}

export const handleScimRateLimited = withRateLimit("scim")(handleScim);
