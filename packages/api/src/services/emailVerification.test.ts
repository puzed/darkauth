import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../errors.ts";
import type { Context } from "../types.ts";
import {
  ensureRegistrationAllowedForVerification,
  getVerificationTokenTtlMinutes,
} from "./emailVerification.ts";

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
    config: {
      publicOrigin: "https://auth.example.com",
    },
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

test("getVerificationTokenTtlMinutes clamps out-of-range settings", async () => {
  const low = createContext([1]);
  const high = createContext([20000]);
  const valid = createContext([120]);

  assert.equal(await getVerificationTokenTtlMinutes(low), 5);
  assert.equal(await getVerificationTokenTtlMinutes(high), 10080);
  assert.equal(await getVerificationTokenTtlMinutes(valid), 120);
});

test("ensureRegistrationAllowedForVerification blocks when verification is required without email transport", async () => {
  const blocked = createContext([true, false, "smtp", "", "", 0, "", ""]);
  const allowed = createContext([false]);

  await assert.rejects(
    () => ensureRegistrationAllowedForVerification(blocked),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "REGISTRATION_DISABLED" &&
      error.message === "Registration currently disabled"
  );
  await assert.doesNotReject(() => ensureRegistrationAllowedForVerification(allowed));
});
