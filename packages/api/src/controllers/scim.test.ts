import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { auditLogs, organizations } from "../db/schema.ts";
import { createScimBearerToken } from "../models/scim.ts";
import type { Context } from "../types.ts";
import { handleScim } from "./scim.ts";

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

async function createContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-scim-controller-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

function createRequest(options: {
  method: string;
  url: string;
  token: string;
  body?: unknown;
}): IncomingMessage {
  const rawBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const request = Readable.from(rawBody ? [rawBody] : []) as IncomingMessage;
  request.method = options.method;
  request.url = options.url;
  request.headers = {
    host: "auth.example.com",
    authorization: `Bearer ${options.token}`,
    "user-agent": "scim-test",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  const response = {
    statusCode: 200,
    body: "",
    json: undefined as unknown,
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        this.json = JSON.parse(this.body);
      }
      return this;
    },
    write(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      return true;
    },
  };
  return response as ServerResponse & { body: string; json: unknown };
}

async function createOrganization(context: Context) {
  const organization = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "engineering",
    name: "Engineering",
  };
  await context.db.insert(organizations).values(organization);
  return organization;
}

test("SCIM resource mutations write safe audit events", async () => {
  const { context, cleanup } = await createContext();
  try {
    const organization = await createOrganization(context);
    const token = await createScimBearerToken(context, {
      name: "Directory",
      organizationId: organization.id,
    });
    const createResponseBody = createResponse();
    await handleScim(
      context,
      createRequest({
        method: "POST",
        url: "/scim/v2/Users",
        token: token.token,
        body: {
          externalId: "external-1",
          userName: "ada@example.com",
          name: { formatted: "Ada Lovelace" },
          active: true,
        },
      }),
      createResponseBody
    );
    const userId = (createResponseBody.json as { id: string }).id;

    await handleScim(
      context,
      createRequest({
        method: "PATCH",
        url: `/scim/v2/Users/${encodeURIComponent(userId)}`,
        token: token.token,
        body: {
          Operations: [{ op: "replace", path: "active", value: false }],
        },
      }),
      createResponse()
    );

    const createAudit = await context.db.query.auditLogs.findFirst({
      where: eq(auditLogs.eventType, "SCIM_USER_CREATE"),
    });
    const patchAudit = await context.db.query.auditLogs.findFirst({
      where: eq(auditLogs.eventType, "SCIM_USER_PATCH"),
    });

    assert.equal(createAudit?.resourceType, "scim_user");
    assert.equal(createAudit?.resourceId, userId);
    assert.equal(createAudit?.organizationId, organization.id);
    assert.equal(createAudit?.success, true);
    assert.deepEqual(createAudit?.details, {
      token_id: token.id,
      action: "create",
      user_name: "ada@example.com",
      external_id: "external-1",
      active: true,
    });
    assert.equal(patchAudit?.resourceId, userId);
    assert.equal((patchAudit?.details as { active?: boolean } | null)?.active, false);
    assert.equal(JSON.stringify(createAudit).includes(token.token), false);
  } finally {
    await cleanup();
  }
});
