import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { organizationMembers, organizations, sessions, users } from "../../db/schema.ts";
import { ForbiddenError, InvalidRequestError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import {
  getSession as getSessionController,
  postSessionOrganization,
  resolveSwitchOrganizationReturnTo,
} from "./session.ts";

function createContext(client: unknown): Context {
  return {
    db: {
      query: {
        clients: {
          findFirst: async () => client,
        },
      },
    },
  } as unknown as Context;
}

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

async function createDatabaseContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-session-controller-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger() } as Context;

  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };

  return { context, cleanup };
}

function createRequest(options: {
  method?: string;
  url?: string;
  sessionId?: string;
  body?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method || "GET";
  request.url = options.url || "/session";
  request.headers = {
    host: "localhost",
    cookie: options.sessionId ? `__Host-DarkAuth-User=${options.sessionId}` : "",
    "user-agent": "node-test",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & {
  body: string;
  headers: Record<string, string>;
  json: unknown;
} {
  let body = "";
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
    get json() {
      return JSON.parse(body);
    },
  } as ServerResponse & { body: string; headers: Record<string, string>; json: unknown };
}

async function createUserOrganization(context: Context, userSub: string, slug: string) {
  await context.db
    .insert(users)
    .values({ sub: userSub, email: `${userSub}@example.com`, name: userSub })
    .onConflictDoNothing();
  const [organization] = await context.db
    .insert(organizations)
    .values({ slug, name: slug, createdByUserSub: userSub })
    .returning();
  assert.ok(organization);
  return organization;
}

async function createUserSession(
  context: Context,
  sessionId: string,
  data: Record<string, unknown>
) {
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: data.sub as string,
    expiresAt: new Date(Date.now() + 60_000),
    data,
  });
}

test("resolveSwitchOrganizationReturnTo accepts local paths without a client", async () => {
  const result = await resolveSwitchOrganizationReturnTo(createContext(null), "/dashboard");

  assert.equal(result, "/dashboard");
});

test("resolveSwitchOrganizationReturnTo rejects unsafe local-looking paths", async () => {
  await assert.rejects(
    () => resolveSwitchOrganizationReturnTo(createContext(null), "//evil.example/path"),
    InvalidRequestError
  );

  await assert.rejects(
    () => resolveSwitchOrganizationReturnTo(createContext(null), "/\\evil"),
    InvalidRequestError
  );
});

test("resolveSwitchOrganizationReturnTo accepts registered client origins", async () => {
  const context = createContext({
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: ["https://app.example.com/logout"],
  });

  const result = await resolveSwitchOrganizationReturnTo(
    context,
    "https://app.example.com/settings/org",
    "demo-client"
  );

  assert.equal(result, "https://app.example.com/settings/org");
});

test("resolveSwitchOrganizationReturnTo rejects unregistered absolute origins", async () => {
  const context = createContext({
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
  });

  await assert.rejects(
    () =>
      resolveSwitchOrganizationReturnTo(context, "https://evil.example/settings", "demo-client"),
    InvalidRequestError
  );
});

test("resolveSwitchOrganizationReturnTo rejects credentialed absolute URLs", async () => {
  const context = createContext({
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
  });

  await assert.rejects(
    () =>
      resolveSwitchOrganizationReturnTo(
        context,
        "https://app.example.com@evil.example/settings",
        "demo-client"
      ),
    InvalidRequestError
  );
});

test("getSession returns current organization context", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    const organization = await createUserOrganization(
      context,
      "user-session-context",
      "session-org"
    );
    await createUserSession(context, "session-context-id", {
      sub: "user-session-context",
      email: "user-session-context@example.com",
      name: "user-session-context",
      organizationId: organization.id,
      organizationSlug: organization.slug,
    });
    const request = createRequest({ sessionId: "session-context-id" });
    const response = createResponse();

    await getSessionController(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      sub: "user-session-context",
      email: "user-session-context@example.com",
      name: "user-session-context",
      emailVerified: false,
      emailVerifiedAt: null,
      pendingEmail: null,
      pendingEmailSetAt: null,
      signInEmail: "user-session-context@example.com",
      authenticated: true,
      passwordResetRequired: false,
      otpRequired: false,
      otpVerified: false,
      keyState: "locked",
      organizationId: organization.id,
      organizationSlug: "session-org",
    });
  } finally {
    await cleanup();
  }
});

test("postSessionOrganization updates session organization and returns validated redirect", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    const organization = await createUserOrganization(context, "user-switch", "switch-org");
    await context.db.insert(organizationMembers).values({
      organizationId: organization.id,
      userSub: "user-switch",
      status: "active",
    });
    await context.db.insert(sessions).values({
      id: "switch-session-id",
      cohort: "user",
      userSub: "user-switch",
      expiresAt: new Date(Date.now() + 60_000),
      data: {
        sub: "user-switch",
        email: "user-switch@example.com",
        clientId: "demo-client",
      },
    });
    await context.db.insert((await import("../../db/schema.ts")).clients).values({
      clientId: "demo-client",
      name: "Demo",
      type: "public",
      tokenEndpointAuthMethod: "none",
      redirectUris: ["https://app.example.com/callback"],
      postLogoutRedirectUris: [],
    });

    const request = createRequest({
      method: "POST",
      url: "/session/organization",
      sessionId: "switch-session-id",
      body: JSON.stringify({
        organization_id: organization.id,
        return_to: "https://app.example.com/account",
        client_id: "demo-client",
      }),
    });
    const response = createResponse();

    await postSessionOrganization(context, request, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      organizationId: organization.id,
      organizationSlug: "switch-org",
      redirectUrl: "https://app.example.com/account",
    });
    const session = await context.db.query.sessions.findFirst();
    assert.equal((session?.data as { organizationId?: string }).organizationId, organization.id);
    assert.equal((session?.data as { organizationSlug?: string }).organizationSlug, "switch-org");
  } finally {
    await cleanup();
  }
});

test("postSessionOrganization rejects organizations without active membership", async () => {
  const { context, cleanup } = await createDatabaseContext();
  try {
    const organization = await createUserOrganization(
      context,
      "user-reject-switch",
      "rejected-org"
    );
    await context.db.insert(organizationMembers).values({
      organizationId: organization.id,
      userSub: "user-reject-switch",
      status: "suspended",
    });
    await createUserSession(context, "reject-switch-session-id", {
      sub: "user-reject-switch",
      email: "user-reject-switch@example.com",
    });
    const request = createRequest({
      method: "POST",
      url: "/session/organization",
      sessionId: "reject-switch-session-id",
      body: JSON.stringify({ organization_id: organization.id }),
    });
    const response = createResponse();

    await assert.rejects(
      () => postSessionOrganization(context, request, response),
      (error: unknown) =>
        error instanceof ForbiddenError &&
        error.message === "Your account cannot sign in with the selected organization."
    );
  } finally {
    await cleanup();
  }
});
