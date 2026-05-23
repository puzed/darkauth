import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadRootConfig } from "./loadConfig.ts";

test("loadRootConfig returns explicit public/issuer settings from config file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-config-"));
  const configPath = path.join(dir, "config.yaml");
  try {
    fs.writeFileSync(
      configPath,
      [
        "userPort: 8080",
        "adminPort: 8081",
        "publicOrigin: https://my.wylde.net",
        "issuer: https://my.wylde.net",
        "rpId: my.wylde.net",
      ].join("\n")
    );

    const root = loadRootConfig(configPath);

    assert.equal(root.userPort, 8080);
    assert.equal(root.adminPort, 8081);
    assert.equal(root.publicOrigin, "https://my.wylde.net");
    assert.equal(root.issuer, "https://my.wylde.net");
    assert.equal(root.rpId, "my.wylde.net");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRootConfig falls back to localhost origin when values missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-config-"));
  const configPath = path.join(dir, "config.yaml");
  try {
    fs.writeFileSync(configPath, ["userPort: 9000"].join("\n"));

    const root = loadRootConfig(configPath);

    assert.equal(root.publicOrigin, "http://localhost:9000");
    assert.equal(root.issuer, "http://localhost:9000");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
