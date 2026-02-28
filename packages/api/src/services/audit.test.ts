import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { countAuditLogs } from "./audit.ts";

test("countAuditLogs uses filtered aggregate query and returns numeric count", async () => {
  let whereCalled = false;
  const context = {
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            whereCalled = true;
            return [{ count: "42" }];
          },
        }),
      }),
    },
  } as unknown as Context;

  const total = await countAuditLogs(context, { eventType: "LOGIN_SUCCESS" });

  assert.equal(total, 42);
  assert.equal(whereCalled, true);
});
