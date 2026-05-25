import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { renderEmailTemplate } from "./emailTemplates.ts";

function createContext(value: unknown): Context {
  return {
    db: {
      query: {
        settings: {
          findFirst: async () => ({ value }),
        },
      },
    },
    services: {},
  } as unknown as Context;
}

test("password_recovery template supports reset_link and recovery_link alias", async () => {
  const context = createContext({
    subject: "Reset for {{email}}",
    text: "Open {{reset_link}} or {{recovery_link}} within {{expires_minutes}} minutes.",
    html: '<a href="{{reset_link}}">Reset</a><a href="{{recovery_link}}">Recover</a>',
  });

  const rendered = await renderEmailTemplate(context, "password_recovery", {
    email: "user@example.com",
    reset_link: "https://auth.example.com/reset-password?token=reset",
    recovery_link: "https://auth.example.com/reset-password?token=reset",
    expires_minutes: "30",
  });

  assert.equal(rendered.subject, "Reset for user@example.com");
  assert.match(rendered.text, /https:\/\/auth\.example\.com\/reset-password\?token=reset/);
  assert.match(rendered.text, /30 minutes/);
  assert.match(rendered.html, /Reset/);
  assert.match(rendered.html, /Recover/);
});
