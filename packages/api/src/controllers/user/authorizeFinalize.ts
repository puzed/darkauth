import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError, NotFoundError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { createAuthCode } from "../../models/authCodes.js";
import { consumePendingAuth } from "../../models/authorize.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { generateRandomString } from "../../utils/crypto.js";
import { parseFormBody, readBody, sendJson } from "../../utils/http.js";

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

      if (!sessionData.sub) {
        throw new InvalidRequestError("User session required");
      }

      const body = await readBody(request);
      const formData = parseFormBody(body);
      const Req = z.object({
        request_id: z.string().min(1),
        approve: z.enum(["true", "false"]).optional(),
        drk_hash: z.string().optional(),
        organization_id: z.string().uuid().optional(),
      });
      const parsed = Req.parse(
        Object.fromEntries(formData as unknown as Iterable<[string, string]>)
      );
      const requestId = parsed.request_id;
      const isApproved = parsed.approve !== "false";

      const pendingRequest = await consumePendingAuth(context, requestId, sessionData.sub);

      if (!pendingRequest) {
        throw new NotFoundError("Authorization request not found or expired");
      }

      context.logger.info(
        {
          requestId,
          clientId: pendingRequest.clientId,
          zkRequested: !!pendingRequest.zkPubKid,
          hasDrkHash: !!parsed.drk_hash,
        },
        "authorize finalize received"
      );

      // Check if request has expired
      if (new Date() > pendingRequest.expiresAt) {
        throw new InvalidRequestError("Authorization request has expired");
      }

      if (!isApproved) {
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

      const drkHashFromClient = parsed.drk_hash;
      const hasZk = !!(pendingRequest.zkPubKid && drkHashFromClient);

      // Store authorization code with PKCE support
      await createAuthCode(context, {
        code,
        clientId: pendingRequest.clientId,
        userSub: sessionData.sub,
        organizationId: parsed.organization_id || pendingRequest.organizationId || undefined,
        redirectUri: pendingRequest.redirectUri,
        nonce: pendingRequest.nonce,
        codeChallenge: pendingRequest.codeChallenge,
        codeChallengeMethod: pendingRequest.codeChallengeMethod || undefined,
        expiresAt: codeExpiresAt,
        hasZk,
        zkPubKid: pendingRequest.zkPubKid,
        drkHash: hasZk ? drkHashFromClient : undefined,
      });

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
          drkHashStored: !!drkHashFromClient,
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
