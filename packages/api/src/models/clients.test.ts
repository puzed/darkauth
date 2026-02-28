import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createPglite } from "../db/pglite.ts";
import type { Context } from "../types.ts";
import { createClient, getClientDashboardIcon, listVisibleApps } from "./clients.ts";

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
    assert.equal(apps[1]?.url, "https://example.com/app-b");
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
