import type { IncomingMessage } from "node:http";
import { ValidationError } from "../../errors.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";

export async function requirePasswordChangeIdentity(
  context: Context,
  request: IncomingMessage
): Promise<{ sub: string; email: string }> {
  const session = await requireSession(context, request, false);
  if (!session.sub || !session.email) {
    throw new ValidationError("Invalid user session");
  }
  return { sub: session.sub, email: session.email };
}
