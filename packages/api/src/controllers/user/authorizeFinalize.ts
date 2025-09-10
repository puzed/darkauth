import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { InvalidRequestError, NotFoundError } from "../../errors.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { createAuthCode } from "../../models/authCodes.js";
import {
  deletePendingAuth,
  getPendingAuth,
  setPendingAuthUserSub,
} from "../../models/authorize.js";
import { getWrappedDrk } from "../../models/wrappedRootKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
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
      // Require authenticated session
      const sessionData = await requireSession(context, request);

      if (!sessionData.sub) {
        throw new InvalidRequestError("User session required");
      }

      const body = await readBody(request);
      const formData = parseFormBody(body);

      const requestId = formData.get("request_id");

      if (!requestId) {
        throw new InvalidRequestError("request_id is required");
      }

      // Look up pending auth request
      const pendingRequest = await getPendingAuth(context, requestId);

      if (!pendingRequest) {
        throw new NotFoundError("Authorization request not found or expired");
      }

      // Check if request has expired
      if (new Date() > pendingRequest.expiresAt) {
        await deletePendingAuth(context, requestId);
        throw new InvalidRequestError("Authorization request has expired");
      }

      // Update pending auth with user subject
      await setPendingAuthUserSub(context, requestId, sessionData.sub);

      // Create authorization code
      const code = generateRandomString(32);
      const codeExpiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds as per spec

      // Handle ZK delivery if needed
      let hasZk = false;
      let drkHash: string | undefined;

      // Check if this is a ZK-enabled request that includes drk_hash from client-side JWE creation
      const drkHashFromClient = formData.get("drk_hash");

      if (pendingRequest.zkPubKid && drkHashFromClient) {
        // ZK client has already created the JWE client-side and provided the hash
        hasZk = true;
        drkHash = drkHashFromClient;
      } else if (pendingRequest.zkPubKid) {
        // Legacy support: server-side check for DRK existence
        // In the proper ZK flow, client handles DRK unwrapping and JWE creation
        try {
          await getWrappedDrk(context, sessionData.sub);
          hasZk = true;
          // Note: In proper ZK flow, drkHash should come from client JWE creation
          // This is fallback for incomplete client implementation
        } catch {}
      }

      // Store authorization code with PKCE support
      await createAuthCode(context, {
        code,
        clientId: pendingRequest.clientId,
        userSub: sessionData.sub,
        redirectUri: pendingRequest.redirectUri,
        codeChallenge: pendingRequest.codeChallenge,
        codeChallengeMethod: pendingRequest.codeChallengeMethod || undefined,
        expiresAt: codeExpiresAt,
        hasZk,
        zkPubKid: pendingRequest.zkPubKid,
        drkHash,
      });

      // Clean up pending auth request
      await deletePendingAuth(context, requestId);

      // Return JSON with code and state as specified in CORE.md
      // Client-side JavaScript will handle the redirect with fragment
      sendJson(response, 200, {
        code,
        state: pendingRequest.state || undefined,
        redirect_uri: pendingRequest.redirectUri,
      });
    }
  )
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({
    request_id: z.string().min(1),
    drk_hash: z.string().optional(),
  });
  const Resp = z.object({
    code: z.string(),
    state: z.string().optional(),
    redirect_uri: z.string().url(),
  });
  registry.registerPath({
    method: "post",
    path: "/authorize/finalize",
    tags: ["Auth"],
    summary: "Finalize authorization after login",
    request: { body: { content: { "application/x-www-form-urlencoded": { schema: Req } } } },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
