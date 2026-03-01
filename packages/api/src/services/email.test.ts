import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError, ValidationError } from "../errors.ts";
import type { Context } from "../types.ts";
import { getSmtpMissingFields, isEmailSendingAvailable, sendEmail } from "./email.ts";

function createContext(values: unknown[]): Context {
  let index = 0;
  return {
    db: {
      query: {
        settings: {
          findFirst: async () => ({ value: values[index++] }),
        },
      },
    },
    services: {},
    logger: {
      error() {},
      warn() {},
      info() {},
      debug() {},
      trace() {},
      fatal() {},
    },
  } as unknown as Context;
}

test("getSmtpMissingFields returns missing required keys", () => {
  const missing = getSmtpMissingFields({
    enabled: true,
    transport: "smtp",
    from: "",
    host: "",
    port: 0,
    user: "",
    password: "",
  });

  assert.deepEqual(missing, [
    "email.from",
    "email.smtp.host",
    "email.smtp.port",
    "email.smtp.user",
    "email.smtp.password",
  ]);
});

test("isEmailSendingAvailable returns true only for complete smtp configuration", async () => {
  const completeContext = createContext([
    true,
    "smtp",
    "noreply@example.com",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);
  const disabledContext = createContext([
    false,
    "smtp",
    "noreply@example.com",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);
  const badTransportContext = createContext([
    true,
    "ses",
    "noreply@example.com",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);

  assert.equal(await isEmailSendingAvailable(completeContext), true);
  assert.equal(await isEmailSendingAvailable(disabledContext), false);
  assert.equal(await isEmailSendingAvailable(badTransportContext), false);
});

test("sendEmail rejects disabled transport before attempting delivery", async () => {
  const context = createContext([
    false,
    "smtp",
    "noreply@example.com",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);

  await assert.rejects(
    () =>
      sendEmail(context, {
        to: "user@example.com",
        subject: "Subject",
        text: "Text",
        html: "<p>Text</p>",
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "EMAIL_TRANSPORT_DISABLED" &&
      error.message === "Email transport is disabled"
  );
});

test("sendEmail rejects incomplete smtp settings", async () => {
  const context = createContext([
    true,
    "smtp",
    "noreply@example.com",
    "smtp.example.com",
    587,
    "",
    "smtp-pass",
  ]);

  await assert.rejects(
    () =>
      sendEmail(context, {
        to: "user@example.com",
        subject: "Subject",
        text: "Text",
        html: "<p>Text</p>",
      }),
    (error: unknown) =>
      error instanceof ValidationError && error.message === "SMTP settings are incomplete"
  );
});
