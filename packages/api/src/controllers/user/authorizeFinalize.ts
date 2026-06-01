import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError, NotFoundError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { createAuthCode } from "../../models/authCodes.ts";
import { consumePendingAuth, getPendingAuth } from "../../models/authorize.ts";
import { resolveAuthorizationOrganizationContext } from "../../models/rbac.ts";
import { isZkKeyUnlockRequired } from "../../models/scimPolicy.ts";
import { getClientIp, logAuditEvent } from "../../services/audit.ts";
import { getSessionId, requireSession, updateSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { generateRandomString } from "../../utils/crypto.ts";
import { parseFormBody, readBody, sendJson } from "../../utils/http.ts";

export const postAuthorizeFinalize = withRateLimit("opaque")(
  withAudit({
    eventType: "AUTH_CODE_ISSUED",
    resourceType: "authorization",
    extractResourceId: (body) =>
      body && typeof body === "object" && "request_id" in body
        ? (body as { request_id?: string }).request_id
        : undefined,
  })(
    async (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ..._params: unknown[]
    ): Promise<void> => {
      const sessionData = await requireSession(context, request);
      const sessionId = getSessionId(request);

      if (!sessionData.sub) {
        throw new InvalidRequestError("User session required");
      }

      const body = await readBody(request);
      const formData = parseFormBody(body);
      const Req = z.object({
        request_id: z.string().min(1),
        approve: z.enum(["true", "false"]).optional(),
        drk_hash: z.string().optional(),
        zk_key_hash: z.string().optional(),
        organization_id: z.string().uuid().optional(),
      });
      const parsed = Req.parse(
        Object.fromEntries(formData as unknown as Iterable<[string, string]>)
      );
      const requestId = parsed.request_id;
      const isApproved = parsed.approve !== "false";

      const pendingRequest = await getPendingAuth(context, requestId);

      if (
        !pendingRequest ||
        (pendingRequest.userSub && pendingRequest.userSub !== sessionData.sub)
      ) {
        throw new NotFoundError("Authorization request not found or expired");
      }

      context.logger.info(
        {
          requestId,
          clientId: pendingRequest.clientId,
          zkRequested: !!pendingRequest.zkPubKid,
          hasDrkHash: !!parsed.drk_hash,
          hasZkKeyHash: !!parsed.zk_key_hash,
        },
        "authorize finalize received"
      );

      // Check if request has expired
      if (new Date() > pendingRequest.expiresAt) {
        throw new InvalidRequestError("Authorization request has expired");
      }

      if (!isApproved) {
        await consumePendingAuth(context, requestId, sessionData.sub);
        sendJson(response, 200, {
          error: "access_denied",
          error_description: "The resource owner denied the authorization request",
          state: pendingRequest.state || undefined,
          redirect_uri: pendingRequest.redirectUri,
        });
        return;
      }

      // Create authorization code
      const code = generateRandomString(32);
      const codeExpiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds as per spec

      const hasZk = !!pendingRequest.zkPubKid;
      const keyDeliveryVersion = pendingRequest.keyDeliveryVersion === "v1-drk" ? "v1-drk" : "v2";
      const deliveredKeyKind =
        pendingRequest.deliveredKeyKind === "root_key" ? "root_key" : "client_app_key";
      const keyHashFromClient =
        keyDeliveryVersion === "v1-drk" ? parsed.drk_hash : parsed.zk_key_hash;
      if (hasZk && !keyHashFromClient) {
        throw new InvalidRequestError(
          keyDeliveryVersion === "v1-drk"
            ? "drk_hash is required for ZK authorization requests"
            : "zk_key_hash is required for ZK authorization requests"
        );
      }
      if (
        hasZk &&
        sessionData.keyState !== "unlocked" &&
        (await isZkKeyUnlockRequired(context, sessionData.sub))
      ) {
        throw new InvalidRequestError("Key unlock is required for ZK authorization requests");
      }

      if (
        pendingRequest.organizationId &&
        parsed.organization_id &&
        parsed.organization_id !== pendingRequest.organizationId
      ) {
        throw new InvalidRequestError(
          "Organization cannot be changed for this authorization request"
        );
      }

      const sessionOrganizationId =
        typeof sessionData.organizationId === "string" ? sessionData.organizationId : undefined;
      const resolvedOrganization = await resolveAuthorizationOrganizationContext(
        context,
        sessionData.sub,
        {
          explicitOrganizationId: parsed.organization_id,
          pendingOrganizationId: pendingRequest.organizationId,
          sessionOrganizationId,
        }
      );

      const consumedPendingRequest = await consumePendingAuth(context, requestId, sessionData.sub);
      if (!consumedPendingRequest) {
        throw new NotFoundError("Authorization request not found or expired");
      }

      await createAuthCode(context, {
        code,
        clientId: consumedPendingRequest.clientId,
        userSub: sessionData.sub,
        organizationId: resolvedOrganization.organizationId,
        redirectUri: consumedPendingRequest.redirectUri,
        scope: consumedPendingRequest.scope,
        nonce: consumedPendingRequest.nonce,
        codeChallenge: consumedPendingRequest.codeChallenge,
        codeChallengeMethod: consumedPendingRequest.codeChallengeMethod || undefined,
        expiresAt: codeExpiresAt,
        hasZk,
        zkPubKid: consumedPendingRequest.zkPubKid,
        drkHash: hasZk && keyDeliveryVersion === "v1-drk" ? keyHashFromClient : undefined,
        zkKeyHash: hasZk ? keyHashFromClient : undefined,
        zkKeyKind: hasZk ? deliveredKeyKind : undefined,
        zkKeyVersion: hasZk ? keyDeliveryVersion : undefined,
      });

      if (sessionId) {
        await updateSession(context, sessionId, {
          ...sessionData,
          organizationId: resolvedOrganization.organizationId,
          organizationSlug: resolvedOrganization.organizationSlug || undefined,
        });
      }

      if (sessionOrganizationId !== resolvedOrganization.organizationId) {
        await logAuditEvent(context, {
          eventType: "ORGANIZATION_SWITCHED",
          method: request.method || "POST",
          path: request.url || "/authorize/finalize",
          cohort: "user",
          userId: sessionData.sub,
          clientId: pendingRequest.clientId,
          ipAddress: getClientIp(request),
          userAgent: Array.isArray(request.headers["user-agent"])
            ? request.headers["user-agent"][0]
            : request.headers["user-agent"],
          success: true,
          statusCode: 200,
          resourceType: "organization",
          resourceId: resolvedOrganization.organizationId,
          action: "switch",
          details: {
            previousOrganizationId: sessionOrganizationId || null,
            organizationId: resolvedOrganization.organizationId,
            organizationSlug: resolvedOrganization.organizationSlug,
            requestId,
          },
        });
      }

      // Return JSON with code and state as specified in CORE.md
      // Client-side JavaScript will handle the redirect with fragment
      sendJson(response, 200, {
        code,
        state: pendingRequest.state || undefined,
        redirect_uri: pendingRequest.redirectUri,
      });

      context.logger.info(
        {
          requestId,
          clientId: pendingRequest.clientId,
          hasZk,
          keyHashStored: !!keyHashFromClient,
          keyDeliveryVersion: hasZk ? keyDeliveryVersion : undefined,
          redirectUri: pendingRequest.redirectUri,
        },
        "authorize finalize completed"
      );
    }
  )
);

const Req = z.object({
  request_id: z.string().min(1),
  approve: z.enum(["true", "false"]).optional(),
  drk_hash: z.string().optional(),
  zk_key_hash: z.string().optional(),
  organization_id: z.string().uuid().optional(),
});
const SuccessResp = z.object({
  code: z.string(),
  state: z.string().optional(),
  redirect_uri: z.string().url(),
});
const DeniedResp = z.object({
  error: z.literal("access_denied"),
  error_description: z.string(),
  state: z.string().optional(),
  redirect_uri: z.string().url(),
});

export const schema = {
  method: "POST",
  path: "/authorize/finalize",
  tags: ["Auth"],
  summary: "Finalize authorization after login",
  description:
    "Issues an authorization code for the selected organization. If the user has multiple active organizations and none is selected or stored in the session, the response uses ORG_CONTEXT_REQUIRED.",
  body: {
    description: "",
    required: true,
    contentType: "application/x-www-form-urlencoded",
    schema: Req,
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": { schema: z.union([SuccessResp, DeniedResp]) },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
