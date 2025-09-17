import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { verifyOtpCode } from "../../models/otp.js";
import { signJWT } from "../../services/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, JWTPayload } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export const postOtpReauth = withAudit({ eventType: "OTP_REAUTH", resourceType: "user" })(
  withRateLimit("otp_verify")(async function postOtpReauth(
    context: Context,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const session = await requireSession(context, request, false);
    const body = await readBody(request);
    const raw = parseJsonSafely(body);
    const Req = z.object({ code: z.string().min(1) });
    const { code } = Req.parse(raw);
    await verifyOtpCode(context, "user", session.sub as string, code);
    const token = await signJWT(
      context,
      { sub: session.sub, purpose: "password_change" } as JWTPayload,
      "10m"
    );
    sendJson(response, 200, { reauth_token: token });
  })
);
