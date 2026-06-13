import assert from "node:assert/strict";
import { test } from "node:test";
import { validateImageBase64 } from "./branding.ts";

test("validateImageBase64 rejects svg branding images", () => {
  const svg = Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64");

  assert.throws(() => validateImageBase64(svg, "image/svg+xml"), /Invalid image type/);
});

test("validateImageBase64 keeps supported raster branding images", () => {
  const data = Buffer.from("image-bytes").toString("base64");

  assert.doesNotThrow(() => validateImageBase64(data, "image/png"));
});
