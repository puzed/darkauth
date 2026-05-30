import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import { opaqueRecords, users } from "../db/schema.ts";
import type { Context } from "../types.ts";
import { getUserOpaqueRecordByEmail } from "./users.ts";

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

test("getUserOpaqueRecordByEmail can find preserved OPAQUE login identity after contact email changes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-users-model-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  try {
    await db.insert(users).values({
      sub: "opaque-identity-user",
      email: "new-contact@example.com",
      opaqueLoginIdentity: "old-login@example.com",
      name: "Identity User",
    });
    await db.insert(opaqueRecords).values({
      sub: "opaque-identity-user",
      envelope: Buffer.from([1, 2, 3]),
      serverPubkey: Buffer.from([4, 5, 6]),
    });

    const byOldLogin = await getUserOpaqueRecordByEmail(context, "old-login@example.com");
    assert.equal(byOldLogin.user.email, "new-contact@example.com");
    assert.equal(byOldLogin.identityU, "old-login@example.com");

    const byContactEmail = await getUserOpaqueRecordByEmail(context, "new-contact@example.com");
    assert.equal(byContactEmail.user.sub, "opaque-identity-user");
    assert.equal(byContactEmail.identityU, "old-login@example.com");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
