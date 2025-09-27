# OpenAPI Contribution Pattern

This guide explains how controller modules contribute to the generated OpenAPI document.

## Overview

DarkAuth controllers export a `schema` constant that satisfies the shared `ControllerSchema` type. Schemas reuse the same Zod validators that power runtime validation. During server startup the OpenAPI builder aggregates every exported schema and converts the Zod definitions with `zod/v4`'s `toJSONSchema` helper.

## Controller Template

```typescript
import { z } from "zod/v4";
import type { ControllerDefinition, ControllerSchema } from "../../types";
import type { Handler } from "../../types";

export const schema = {
  method: "GET",
  path: "/users/{userId}",
  tags: ["Users"],
  summary: "Fetch user",
  params: z.object({
    userId: z.string().uuid(),
  }),
  responses: {
    200: {
      description: "User",
      content: {
        "application/json": {
          schema: UserSchema,
        },
      },
    },
  },
} as const satisfies ControllerSchema;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({ context, response, params }) => {
  const user = await getUser(context, params.userId);
  sendJson(response, 200, user);
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
```

## Schema Fields

- `method`: Uppercase HTTP method (`"GET"`, `"POST"`, etc.).
- `path`: Route pattern that matches the router registration.
- `summary`: Short description used in the generated docs.
- `tags`: Optional array of strings for grouping endpoints.
- `params`: Optional `z.object` describing path parameters.
- `query`: Optional `z.object` describing the query string.
- `body`: Optional object with `description`, `required`, `contentType`, and a `schema` value (Zod schema or plain JSON schema fragment).
- `responses`: Record keyed by status code. Each entry supplies a `description` and optional `content` map where each media type contains a `schema` (Zod or JSON schema fragment).

## Zod Usage

- Import Zod from `zod/v4` so the validator is compatible with `toJSONSchema`.
- Reuse shared schemas from `packages/api/src/schemas` whenever possible.
- When you need a raw JSON schema snippet, supply a plain object instead of wrapping it with Zod.

## Multiple Routes per Module

If a module serves multiple endpoints, export additional schema constants (for example `export const getSchema` and `export const listSchema`). The OpenAPI builder collects every exported schema explicitly listed in `packages/api/src/http/openapi.ts`.

## Validation Helpers

- Prefer strict Zod schemas (`.strict()` or explicit unions) so the generated JSON schema mirrors the runtime behaviour.
- Use existing shared response fragments such as `genericErrors` where appropriate; these are plain JSON schema references that resolve to `#/components/schemas/*` values.

Following this pattern keeps the OpenAPI document in sync with the live validators without requiring the deprecated `@asteasolutions/zod-to-openapi` integration.
