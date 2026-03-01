import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  type EmailTemplate,
  type EmailTemplateKey,
  getAllEmailTemplates,
  updateEmailTemplate,
} from "../../services/emailTemplates.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const TemplateSchema = z.object({
  subject: z.string(),
  text: z.string(),
  html: z.string(),
});

const KeySchema = z.enum([
  "signup_verification",
  "signup_existing_account_notice",
  "verification_resend_confirmation",
  "email_change_verification",
  "password_recovery",
  "admin_test_email",
]);

const UpdateSchema = z.object({
  key: KeySchema,
  template: TemplateSchema,
});

export async function getAdminEmailTemplates(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const templates = await getAllEmailTemplates(context);
  sendJson(response, 200, { templates });
}

export async function putAdminEmailTemplate(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole === "read") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = UpdateSchema.parse(raw);

  await updateEmailTemplate(
    context,
    parsed.key as EmailTemplateKey,
    parsed.template as EmailTemplate
  );
  sendJson(response, 200, { success: true, key: parsed.key });
}

export const getSchema = {
  method: "GET",
  path: "/admin/email-templates",
  tags: ["Settings"],
  summary: "List email templates",
  responses: {
    200: { description: "OK" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const putSchema = {
  method: "PUT",
  path: "/admin/email-templates",
  tags: ["Settings"],
  summary: "Update email template",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UpdateSchema,
  },
  responses: {
    200: { description: "OK" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
