import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import { verifyIdTokenHint } from "../../services/jwks.ts";
import {
  clearRefreshTokenCookie,
  clearSessionCookies,
  deleteSession,
  getSessionId,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema, JWTPayload } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseFormBody, readBody, redirect, sendJson } from "../../utils/http.ts";

const Resp = z.object({
  logged_out: z.boolean().optional(),
  message: z.string().optional(),
  redirect_uri: z.string().optional(),
});

interface LogoutParams {
  id_token_hint?: string;
  post_logout_redirect_uri?: string;
  client_id?: string;
  state?: string;
}

function audienceFromClaims(claims: JWTPayload): string | undefined {
  const aud = claims.aud;
  if (typeof aud === "string") return aud;
  if (Array.isArray(aud) && typeof aud[0] === "string") return aud[0];
  return undefined;
}

function buildPostLogoutRedirect(uri: string, state?: string): string {
  const url = new URL(uri);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

async function resolvePostLogoutRedirect(
  context: Context,
  params: LogoutParams,
  audience?: string
): Promise<string | undefined> {
  if (!params.post_logout_redirect_uri) return undefined;
  const clientId = audience || params.client_id;
  if (!clientId) {
    throw new InvalidRequestError(
      "client_id is required when post_logout_redirect_uri is provided"
    );
  }
  const client = await getClient(context, clientId);
  if (!client) throw new InvalidRequestError("Unknown client");
  if (!client.postLogoutRedirectUris.includes(params.post_logout_redirect_uri)) {
    throw new InvalidRequestError("Invalid post_logout_redirect_uri");
  }
  return buildPostLogoutRedirect(params.post_logout_redirect_uri, params.state);
}

async function endCurrentSession(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await deleteSession(context, sessionId);
  }
  clearSessionCookies(response, false);
  clearRefreshTokenCookie(response, false);
}

function buildConfirmationRedirect(params: LogoutParams): string {
  const qs = new URLSearchParams();
  qs.set("confirm", "1");
  if (params.post_logout_redirect_uri)
    qs.set("post_logout_redirect_uri", params.post_logout_redirect_uri);
  if (params.client_id) qs.set("client_id", params.client_id);
  if (params.state) qs.set("state", params.state);
  return `/logout?${qs.toString()}`;
}

async function handleGetLogout(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const params: LogoutParams = {
    id_token_hint: url.searchParams.get("id_token_hint") || undefined,
    post_logout_redirect_uri: url.searchParams.get("post_logout_redirect_uri") || undefined,
    client_id: url.searchParams.get("client_id") || undefined,
    state: url.searchParams.get("state") || undefined,
  };

  let audience: string | undefined;
  let hintValid = false;
  if (params.id_token_hint) {
    const claims = await verifyIdTokenHint(context, params.id_token_hint);
    if (claims) {
      hintValid = true;
      audience = audienceFromClaims(claims);
      if (params.client_id && audience && params.client_id !== audience) {
        throw new InvalidRequestError("client_id does not match id_token_hint");
      }
    }
  }

  const redirectUri = await resolvePostLogoutRedirect(
    context,
    params,
    hintValid ? audience : undefined
  );

  if (!hintValid) {
    const sessionId = getSessionId(request);
    if (sessionId) {
      redirect(response, buildConfirmationRedirect(params));
      return;
    }
    redirect(response, redirectUri || "/logout?signed_out=1");
    return;
  }

  await endCurrentSession(context, request, response);
  redirect(response, redirectUri || "/logout?signed_out=1");
}

async function handlePostLogout(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const formData = parseFormBody(await readBody(request));
  const params: LogoutParams = {
    id_token_hint: formData.get("id_token_hint") || undefined,
    post_logout_redirect_uri: formData.get("post_logout_redirect_uri") || undefined,
    client_id: formData.get("client_id") || undefined,
    state: formData.get("state") || undefined,
  };

  let audience: string | undefined;
  if (params.id_token_hint) {
    const claims = await verifyIdTokenHint(context, params.id_token_hint);
    if (claims) audience = audienceFromClaims(claims);
  }

  const redirectUri = await resolvePostLogoutRedirect(context, params, audience);

  await endCurrentSession(context, request, response);

  if (redirectUri) {
    sendJson(response, 200, { logged_out: true, redirect_uri: redirectUri });
  } else {
    sendJson(response, 200, { message: "Logged out successfully", logged_out: true });
  }
}

export const getLogout = withAudit({
  eventType: "USER_LOGOUT",
  resourceType: "user",
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    await handleGetLogout(context, request, response);
  }
);

export const postLogout = withAudit({
  eventType: "USER_LOGOUT",
  resourceType: "user",
  extractResourceId: (body) =>
    body && typeof body === "object" && "client_id" in body
      ? (body as { client_id?: string }).client_id
      : undefined,
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    await handlePostLogout(context, request, response);
  }
);

export const getSchema = {
  method: "GET",
  path: "/logout",
  tags: ["Auth"],
  summary: "RP-Initiated Logout (OIDC end_session_endpoint)",
  description:
    "Ends the DarkAuth session. Accepts id_token_hint, post_logout_redirect_uri, client_id, and state. With a valid id_token_hint the session is ended and the browser is redirected to an allowlisted post_logout_redirect_uri; otherwise the user is asked to confirm.",
  responses: {
    302: { description: "Redirect to post_logout_redirect_uri or confirmation page" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const schema = {
  method: "POST",
  path: "/logout",
  tags: ["Auth"],
  summary: "User logout",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
