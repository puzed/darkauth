import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { listVisibleApps } from "../../models/clients.ts";
import { getSession as getSessionData, getSessionId } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendError, sendJson } from "../../utils/http.ts";

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
    const apps = await listVisibleApps(context);
    return sendJson(response, 200, { apps });
  } catch (error) {
    context.logger.error({ error }, "Failed to fetch user apps");
    return sendError(response, new Error("Internal server error"));
  }
}

const UserDashboardAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  logoUrl: z.string().optional(),
  iconMode: z.enum(["letter", "emoji", "upload"]).optional(),
  iconEmoji: z.string().optional(),
  iconLetter: z.string().optional(),
  iconUrl: z.string().optional(),
});

export const schema = {
  method: "GET",
  path: "/apps",
  tags: ["Apps"],
  summary: "List dashboard apps",
  responses: {
    200: {
      description: "Visible applications",
      content: {
        "application/json": {
          schema: z.object({ apps: z.array(UserDashboardAppSchema) }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
