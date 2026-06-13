import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createServer, isDemoCorsOriginAllowed } from "./createServer.ts";
import type { Context } from "./types.ts";

const serverApplication = createServer({
  db: null as never,
  config: { port: 0, issuer: "http://localhost:9080" },
  logger: { info() {}, error() {} },
} satisfies Context);

after(async () => {
  await new Promise<void>((resolve, reject) =>
    serverApplication.server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("demo CORS origin policy allows only loopback demo origins", () => {
  assert.equal(isDemoCorsOriginAllowed("http://localhost:9092"), true);
  assert.equal(isDemoCorsOriginAllowed("http://127.0.0.1:9092"), true);
  assert.equal(isDemoCorsOriginAllowed("http://[::1]:9092"), true);
  assert.equal(isDemoCorsOriginAllowed("https://evil.example"), false);
  assert.equal(isDemoCorsOriginAllowed("http://localhost.evil.example"), false);
  assert.equal(isDemoCorsOriginAllowed("null"), false);
});

test("demo CORS does not reflect credentialed headers for non-loopback origins", async () => {
  await new Promise<void>((resolve) => serverApplication.server.listen(0, "127.0.0.1", resolve));
  const address = serverApplication.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const allowed = await fetch(`${baseUrl}/demo/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:9092",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:9092");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), null);

  const rejected = await fetch(`${baseUrl}/demo/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  assert.equal(rejected.headers.get("access-control-allow-credentials"), null);
});
