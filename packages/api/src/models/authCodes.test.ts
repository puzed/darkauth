import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { consumeAuthCode } from "./authCodes.ts";

test("consumeAuthCode returns true when an unconsumed code is atomically updated", async () => {
  let updateCalled = false;
  let setCalled = false;
  let whereCalled = false;
  let returningCalled = false;

  const context = {
    db: {
      update: () => {
        updateCalled = true;
        return {
          set: () => {
            setCalled = true;
            return {
              where: () => {
                whereCalled = true;
                return {
                  returning: async () => {
                    returningCalled = true;
                    return [{ code: "code-1" }];
                  },
                };
              },
            };
          },
        };
      },
    },
  } as unknown as Context;

  const consumed = await consumeAuthCode(context, "code-1");

  assert.equal(consumed, true);
  assert.equal(updateCalled, true);
  assert.equal(setCalled, true);
  assert.equal(whereCalled, true);
  assert.equal(returningCalled, true);
});

test("consumeAuthCode returns false when code was already consumed by another request", async () => {
  const context = {
    db: {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    },
  } as unknown as Context;

  const consumed = await consumeAuthCode(context, "code-1");

  assert.equal(consumed, false);
});
