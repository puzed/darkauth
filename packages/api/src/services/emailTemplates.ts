import type { Context } from "../types.ts";
import { getSetting, setSetting } from "./settings.ts";

export type EmailTemplateKey =
  | "signup_verification"
  | "verification_resend_confirmation"
  | "email_change_verification"
  | "password_recovery"
  | "admin_test_email";

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  signup_verification: {
    subject: "Verify your email",
    text: "Hello {{name}},\n\nPlease verify your email by opening this link:\n{{verification_link}}\n\nIf you did not create this account, ignore this email.",
    html: '<p>Hello {{name}},</p><p>Please verify your email by opening this link:</p><p><a href="{{verification_link}}">Verify email</a></p><p>If you did not create this account, ignore this email.</p>',
  },
  verification_resend_confirmation: {
    subject: "A new verification link has been sent",
    text: "Hello {{name}},\n\nA new verification link has been requested for this account.\n\nIf this was you, use the newest email in your inbox.",
    html: "<p>Hello {{name}},</p><p>A new verification link has been requested for this account.</p><p>If this was you, use the newest email in your inbox.</p>",
  },
  email_change_verification: {
    subject: "Verify your new email address",
    text: "Hello {{name}},\n\nPlease verify your new email address by opening this link:\n{{verification_link}}\n\nYour current email remains active until verification completes.",
    html: '<p>Hello {{name}},</p><p>Please verify your new email address by opening this link:</p><p><a href="{{verification_link}}">Verify new email</a></p><p>Your current email remains active until verification completes.</p>',
  },
  password_recovery: {
    subject: "Password recovery",
    text: "Hello {{name}},\n\nUse this link to recover access to your account:\n{{recovery_link}}",
    html: '<p>Hello {{name}},</p><p>Use this link to recover access to your account:</p><p><a href="{{recovery_link}}">Recover account</a></p>',
  },
  admin_test_email: {
    subject: "DarkAuth SMTP test",
    text: "This is a test email from DarkAuth.\n\nSent at: {{sent_at}}",
    html: "<p>This is a test email from DarkAuth.</p><p>Sent at: {{sent_at}}</p>",
  },
};

function templateBaseKey(key: EmailTemplateKey): string {
  return `email.templates.${key}`;
}

function renderValue(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, varName: string) => {
    return variables[varName] ?? "";
  });
}

export function listTemplateDefaults(): Record<EmailTemplateKey, EmailTemplate> {
  return DEFAULT_TEMPLATES;
}

export async function ensureEmailTemplateDefaults(context: Context): Promise<void> {
  const keys = Object.keys(DEFAULT_TEMPLATES) as EmailTemplateKey[];
  for (const key of keys) {
    const existing = (await getSetting(context, templateBaseKey(key))) as EmailTemplate | undefined;
    if (!existing || typeof existing !== "object") {
      await setSetting(context, templateBaseKey(key), DEFAULT_TEMPLATES[key]);
    }
  }
}

export async function getEmailTemplate(
  context: Context,
  key: EmailTemplateKey
): Promise<EmailTemplate> {
  const stored = (await getSetting(context, templateBaseKey(key))) as
    | Partial<EmailTemplate>
    | undefined
    | null;
  const defaults = DEFAULT_TEMPLATES[key];
  if (!stored || typeof stored !== "object") {
    return defaults;
  }

  return {
    subject: typeof stored.subject === "string" ? stored.subject : defaults.subject,
    text: typeof stored.text === "string" ? stored.text : defaults.text,
    html: typeof stored.html === "string" ? stored.html : defaults.html,
  };
}

export async function getAllEmailTemplates(
  context: Context
): Promise<Record<EmailTemplateKey, EmailTemplate>> {
  await ensureEmailTemplateDefaults(context);
  const keys = Object.keys(DEFAULT_TEMPLATES) as EmailTemplateKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getEmailTemplate(context, key)] as const)
  );
  return Object.fromEntries(entries) as Record<EmailTemplateKey, EmailTemplate>;
}

export async function updateEmailTemplate(
  context: Context,
  key: EmailTemplateKey,
  template: EmailTemplate
): Promise<void> {
  await setSetting(context, templateBaseKey(key), {
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export async function renderEmailTemplate(
  context: Context,
  key: EmailTemplateKey,
  variables: Record<string, string>
): Promise<EmailTemplate> {
  const template = await getEmailTemplate(context, key);
  return {
    subject: renderValue(template.subject, variables),
    text: renderValue(template.text, variables),
    html: renderValue(template.html, variables),
  };
}
