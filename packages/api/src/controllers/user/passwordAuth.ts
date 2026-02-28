import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";

export async function requirePasswordChangeIdentity(
  context: Context,
  request: IncomingMessage
): Promise<{ sub: string; email: string }> {
  try {
    const session = await requireSession(context, request, false);
    if (!session.sub || !session.email) {
      throw new ValidationError("Invalid user session");
    }
    return { sub: session.sub, email: session.email };
  } catch {
    const authHeader = request.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!match?.[1]) {
      throw new UnauthorizedError("No session cookie");
    }
    try {
      const jwks = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
      const verified = await jwtVerify(match[1], jwks, { issuer: context.config.issuer });
      const sub = typeof verified.payload.sub === "string" ? verified.payload.sub : "";
      const email = typeof verified.payload.email === "string" ? verified.payload.email : "";
      if (!sub || !email) {
        throw new UnauthorizedError("Invalid bearer token");
      }
      return { sub, email };
    } catch {
      throw new UnauthorizedError("Invalid bearer token");
    }
  }
}
