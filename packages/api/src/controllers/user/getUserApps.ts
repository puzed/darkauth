import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { clients } from "../../db/schema.js";
import { UnauthorizedError } from "../../errors.js";
import { getSession as getSessionData, getSessionId } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendError, sendJson } from "../../utils/http.js";

export async function getUserApps(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    // Check for authentication using session
    const sessionId = getSessionId(request);

    if (!sessionId) {
      throw new UnauthorizedError("No session token found");
    }

    const sessionData = await getSessionData(context, sessionId);

    if (!sessionData || !sessionData.sub) {
      throw new UnauthorizedError("Invalid or expired session");
    }

    // Get all clients that should be shown on user dashboard
    const visibleApps = await context.db
      .select({
        id: clients.clientId,
        name: clients.name,
        description: clients.description,
        url: clients.appUrl,
        logoUrl: clients.logoUrl,
      })
      .from(clients)
      .where(eq(clients.showOnUserDashboard, true));

    return sendJson(response, 200, {
      apps: visibleApps.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description || undefined,
        url: app.url || undefined,
        logoUrl: app.logoUrl || undefined,
      })),
    });
  } catch (error) {
    context.logger.error({ error }, "Failed to fetch user apps");
    return sendError(response, new Error("Internal server error"));
  }
}
