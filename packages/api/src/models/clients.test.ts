import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import type { Context } from "../types.ts";
import {
  createClient,
  getClient,
  getClientDashboardIcon,
  listClients,
  listVisibleApps,
  updateClient,
} from "./clients.ts";

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

test("listVisibleApps returns sorted apps and icon metadata for dashboard rendering", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "app-z",
      name: "Zeta",
      type: "public",
      showOnUserDashboard: true,
      dashboardPosition: 2,
      dashboardIconMode: "letter",
      dashboardIconLetter: "Z",
    });
    await createClient(context, {
      clientId: "app-a",
      name: "Alpha",
      type: "public",
      showOnUserDashboard: true,
      dashboardPosition: 1,
      dashboardIconMode: "upload",
      dashboardIconData: Buffer.from("alpha"),
    });
    await createClient(context, {
      clientId: "app-b",
      name: "Alpha",
      type: "public",
      showOnUserDashboard: true,
      dashboardPosition: 1,
      dashboardIconMode: "upload",
      dashboardIconMimeType: "image/png",
      dashboardIconData: Buffer.from("beta"),
      appUrl: "https://example.com/app-b",
      dashboardAutoLogin: true,
    });
    await createClient(context, {
      clientId: "hidden",
      name: "Hidden",
      type: "public",
      showOnUserDashboard: false,
      dashboardPosition: 0,
    });

    const apps = await listVisibleApps(context);

    assert.deepEqual(
      apps.map((app) => app.id),
      ["app-a", "app-b", "app-z"]
    );
    assert.equal(apps[0]?.iconMode, "upload");
    assert.equal(apps[0]?.iconUrl, undefined);
    assert.equal(apps[1]?.iconMode, "upload");
    assert.equal(apps[1]?.iconUrl, "/api/client-icons/app-b");
    assert.equal(apps[1]?.url, "https://example.com/app-b?darkauth_login=1");
    assert.equal(apps[2]?.iconMode, "letter");
    assert.equal(apps[2]?.iconLetter, "Z");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("getClientDashboardIcon returns icon data for existing client and null for missing client", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "icon-client",
      name: "Icon Client",
      type: "public",
      dashboardIconMode: "upload",
      dashboardIconMimeType: "image/png",
      dashboardIconData: Buffer.from([1, 2, 3]),
    });

    const icon = await getClientDashboardIcon(context, "icon-client");
    const missing = await getClientDashboardIcon(context, "missing-client");

    assert.ok(icon);
    assert.equal(icon.dashboardIconMode, "upload");
    assert.equal(icon.dashboardIconMimeType, "image/png");
    assert.ok(icon.dashboardIconData);
    assert.equal(Buffer.from(icon.dashboardIconData).equals(Buffer.from([1, 2, 3])), true);
    assert.equal(missing, null);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("createClient and updateClient persist serialized scope definitions", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "scope-client",
      name: "Scope Client",
      type: "public",
      scopes: [
        { key: "openid", description: "Authenticate you" },
        { key: "profile", description: "Access your profile information" },
        "profile",
        '{"key":"email","description":"Access your email"}',
      ],
    });

    const created = await getClient(context, "scope-client");
    assert.ok(created);
    assert.deepEqual(created.scopes, [
      '{"key":"openid","description":"Authenticate you"}',
      '{"key":"profile","description":"Access your profile information"}',
      '{"key":"email","description":"Access your email"}',
    ]);

    await updateClient(context, "scope-client", {
      scopes: ["openid", { key: "offline_access", description: "Refresh your session" }],
    });

    const updated = await getClient(context, "scope-client");
    assert.ok(updated);
    assert.deepEqual(updated.scopes, [
      "openid",
      '{"key":"offline_access","description":"Refresh your session"}',
    ]);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("createClient pins auth method to client type", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "confidential-default",
      name: "Confidential Default",
      type: "confidential",
    });
    await createClient(context, {
      clientId: "public-basic",
      name: "Public Basic",
      type: "public",
      tokenEndpointAuthMethod: "client_secret_basic",
    });

    const confidential = await getClient(context, "confidential-default");
    const publicClient = await getClient(context, "public-basic");

    assert.equal(confidential?.tokenEndpointAuthMethod, "client_secret_basic");
    assert.equal(publicClient?.tokenEndpointAuthMethod, "none");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("updateClient pins confidential clients to client_secret_basic", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "public-client",
      name: "Public Client",
      type: "public",
    });

    await updateClient(context, "public-client", {
      type: "confidential",
      tokenEndpointAuthMethod: "none",
    });

    const updated = await getClient(context, "public-client");
    assert.equal(updated?.type, "confidential");
    assert.equal(updated?.tokenEndpointAuthMethod, "client_secret_basic");
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("createClient and updateClient enforce key delivery version and delivered key kind", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-clients-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;

  try {
    await createClient(context, {
      clientId: "v2-client",
      name: "V2 Client",
      type: "public",
      zkDelivery: "fragment-jwe",
    });

    const created = await getClient(context, "v2-client");
    assert.ok(created);
    assert.equal(created.keyDeliveryVersion, "v2");
    assert.equal(created.deliveredKeyKind, "client_app_key");
    assert.equal(created.clientKeyScope, "organization");

    const listedCreated = await listClients(context, { search: "v2-client" });
    assert.equal(listedCreated.clients[0]?.clientKeyScope, "organization");

    await updateClient(context, "v2-client", {
      keyDeliveryVersion: "v1-drk",
      deliveredKeyKind: "root_key",
      clientKeyScope: "account",
    });

    const updated = await getClient(context, "v2-client");
    assert.ok(updated);
    assert.equal(updated.keyDeliveryVersion, "v1-drk");
    assert.equal(updated.deliveredKeyKind, "root_key");
    assert.equal(updated.clientKeyScope, "account");

    const listedUpdated = await listClients(context, { search: "v2-client" });
    assert.equal(listedUpdated.clients[0]?.clientKeyScope, "account");

    await assert.rejects(
      () =>
        updateClient(context, "v2-client", {
          keyDeliveryVersion: "v2",
          deliveredKeyKind: "root_key",
        }),
      /v2 clients must deliver client_app_key/
    );
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
