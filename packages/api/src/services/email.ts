import { AppError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { type EmailTemplateKey, renderEmailTemplate } from "./emailTemplates.ts";
import { getSetting } from "./settings.ts";

interface SmtpSettings {
  enabled: boolean;
  transport: string;
  from: string;
  host: string;
  port: number;
  user: string;
  password: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export async function getSmtpSettings(context: Context): Promise<SmtpSettings> {
  const [enabled, transport, from, host, port, user, password] = await Promise.all([
    getSetting(context, "email.smtp.enabled"),
    getSetting(context, "email.transport"),
    getSetting(context, "email.from"),
    getSetting(context, "email.smtp.host"),
    getSetting(context, "email.smtp.port"),
    getSetting(context, "email.smtp.user"),
    getSetting(context, "email.smtp.password"),
  ]);

  return {
    enabled: asBoolean(enabled),
    transport: asString(transport) || "smtp",
    from: asString(from),
    host: asString(host),
    port: asNumber(port),
    user: asString(user),
    password: asString(password),
  };
}

export function getSmtpMissingFields(settings: SmtpSettings): string[] {
  const missing: string[] = [];
  if (!settings.from) missing.push("email.from");
  if (!settings.transport) missing.push("email.transport");
  if (!settings.host) missing.push("email.smtp.host");
  if (!settings.port || settings.port < 1 || settings.port > 65535) missing.push("email.smtp.port");
  if (!settings.user) missing.push("email.smtp.user");
  if (!settings.password) missing.push("email.smtp.password");
  return missing;
}

export async function isEmailSendingAvailable(context: Context): Promise<boolean> {
  const settings = await getSmtpSettings(context);
  if (!settings.enabled) return false;
  if (settings.transport !== "smtp") return false;
  return getSmtpMissingFields(settings).length === 0;
}

export async function sendEmail(
  context: Context,
  params: { to: string; subject: string; text: string; html: string }
): Promise<void> {
  const settings = await getSmtpSettings(context);
  if (!settings.enabled) {
    throw new AppError("Email transport is disabled", "EMAIL_TRANSPORT_DISABLED", 400);
  }
  if (settings.transport !== "smtp") {
    throw new ValidationError("Unsupported email transport");
  }

  const missing = getSmtpMissingFields(settings);
  if (missing.length > 0) {
    throw new ValidationError("SMTP settings are incomplete", { missing });
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: {
      user: settings.user,
      pass: settings.password,
    },
  });

  await transporter.sendMail({
    from: settings.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

export async function sendTemplatedEmail(
  context: Context,
  params: {
    to: string;
    template: EmailTemplateKey;
    variables: Record<string, string>;
  }
): Promise<void> {
  const rendered = await renderEmailTemplate(context, params.template, params.variables);
  await sendEmail(context, {
    to: params.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

export async function sendTestEmailToCurrentAdmin(
  context: Context,
  adminEmail: string
): Promise<void> {
  const sentAt = new Date().toISOString();
  await sendTemplatedEmail(context, {
    to: adminEmail,
    template: "admin_test_email",
    variables: {
      sent_at: sentAt,
    },
  });
}
