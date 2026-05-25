import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import {
  getPasswordResetTokenTtlMinutes,
  normalizePasswordResetEmail,
  PASSWORD_RESET_GENERIC_MESSAGE,
  requestPasswordResetEmail,
  shouldShowPasswordResetLink,
} from "./passwordReset.ts";

function createLogger() {
  return {
    error() {},
    warn() {},
    info() {},
    debug() {},
    trace() {},
    fatal() {},
  };
}

function createContext(values: unknown[]): Context {
  let index = 0;
  return {
    db: {
      query: {
        settings: {
          findFirst: async () => ({ value: values[index++] }),
        },
      },
      insert: () => ({
        values: async () => {},
      }),
    },
    config: {
      publicOrigin: "https://auth.example.com",
    },
    services: {},
    logger: createLogger(),
  } as unknown as Context;
}

test("getPasswordResetTokenTtlMinutes clamps out-of-range settings", async () => {
  const low = createContext([1]);
  const high = createContext([20000]);
  const valid = createContext([120]);

  assert.equal(await getPasswordResetTokenTtlMinutes(low), 5);
  assert.equal(await getPasswordResetTokenTtlMinutes(high), 1440);
  assert.equal(await getPasswordResetTokenTtlMinutes(valid), 120);
});

test("requestPasswordResetEmail returns generic success when disabled", async () => {
  const context = createContext([false]);

  const response = await requestPasswordResetEmail(context, {
    email: " User@Example.COM ",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });

  assert.deepEqual(response, { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
  assert.equal(normalizePasswordResetEmail(" User@Example.COM "), "user@example.com");
});

test("requestPasswordResetEmail returns generic success when smtp is unavailable", async () => {
  const context = createContext([true, false]);

  const response = await requestPasswordResetEmail(context, {
    email: "user@example.com",
    ipAddress: "127.0.0.1",
  });

  assert.deepEqual(response, { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
});

test("shouldShowPasswordResetLink requires visible setting and available email", async () => {
  const hidden = createContext([false]);
  const visible = createContext([
    true,
    true,
    true,
    "smtp",
    "DarkAuth <noreply@example.com>",
    "smtp.example.com",
    587,
    "smtp-user",
    "smtp-pass",
  ]);

  assert.equal(await shouldShowPasswordResetLink(hidden), false);
  assert.equal(await shouldShowPasswordResetLink(visible), true);
});
