import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestTextColor,
  copyKnownBrandingColorsForMode,
  defaultDarkSemanticBrandingColors,
  defaultLightSemanticBrandingColors,
  isHexBrandingColor,
  normalizeBrandingColors,
  readableTextColor,
  semanticBrandingColorKeys,
} from "./index.ts";

test("normalizes missing semantic color keys without removing legacy or unknown keys", () => {
  const colors = normalizeBrandingColors(
    {
      primary: "#123456",
      customToken: "oklch(70% 0.2 120)",
    },
    "light"
  );

  assert.equal(colors.brandColor, defaultLightSemanticBrandingColors.brandColor);
  assert.equal(colors.primary, "#123456");
  assert.equal(colors.customToken, "oklch(70% 0.2 120)");
  for (const key of semanticBrandingColorKeys) assert.ok(colors[key]);
});

test("copies known semantic colors while preserving unknown target keys", () => {
  const copied = copyKnownBrandingColorsForMode(
    {
      ...defaultLightSemanticBrandingColors,
      iconBackgroundColor: "#abcdef",
      targetOnly: "#111111",
    },
    {
      ...defaultDarkSemanticBrandingColors,
      unknownDarkKey: "kept",
    },
    "light",
    "dark"
  );

  assert.equal(copied.brandColor, defaultDarkSemanticBrandingColors.brandColor);
  assert.equal(copied.iconBackgroundColor, "#abcdef");
  assert.equal(copied.unknownDarkKey, "kept");
  assert.equal(copied.targetOnly, undefined);
});

test("validates hex colors accepted by branding controls", () => {
  assert.equal(isHexBrandingColor("#fff"), true);
  assert.equal(isHexBrandingColor("#ffffff"), true);
  assert.equal(isHexBrandingColor("ffffff"), true);
  assert.equal(isHexBrandingColor("white"), false);
  assert.equal(isHexBrandingColor("#ffff"), false);
});

test("chooses readable foregrounds for low contrast combinations", () => {
  assert.equal(readableTextColor("#ffffff", "#ffffff", "#111827"), "#111827");
  assert.equal(readableTextColor("#111827", "#ffffff", "#ffffff"), "#111827");
  assert.equal(bestTextColor("#ffffff"), "#111827");
  assert.equal(bestTextColor("#111827"), "#ffffff");
});
