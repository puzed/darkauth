# OpenAPI Contribution Pattern

This document explains how to add OpenAPI documentation to new endpoints in the DarkAuth project.

## Overview

DarkAuth uses the `@asteasolutions/zod-to-openapi` library to automatically generate OpenAPI (Swagger) documentation from Zod schemas. Controllers co‑locate their Zod schemas and export a `registerOpenApi(registry)` function. The admin server gathers these to build the OpenAPI document.

## Basic Pattern

Each controller that should be included in the API documentation must export a function `registerOpenApi(registry: OpenAPIRegistry)` and co‑locate any Zod schemas it needs:

```typescript
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
const AdminUserSchema = z.object({ /* ... */   });
}
const CreateAdminUserSchema = z.object({ /* ... */ });

// Controller function...
export async function createAdminUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  // Implementation...
}

// OpenAPI specification
export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
  method: "post",
  path: "/admin/admin-users",
  tags: ["Admin Users"],
  summary: "Create admin user",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateAdminUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: AdminUserSchema,
        },
      },
    },
  },
});
```

## Route Specification Structure

### Required Fields

- `method`: HTTP method (lowercase: "get", "post", "put", "delete", etc.)
- `path`: API endpoint path
- `tags`: Array of tags for grouping endpoints
- `summary`: Brief description of the endpoint

### Request Specification

For endpoints that accept request bodies:

```typescript
request: {
  body: {
    content: {
      "application/json": {
        schema: InputSchema,
      },
    },
  },
}
```

For endpoints with query parameters:

```typescript
request: {
  query: {
    page: { type: "number", required: false },
    limit: { type: "number", required: false },  
    search: { type: "string", required: false },
  },
}
```

For endpoints with path parameters:

```typescript
request: {
  params: {
    id: { type: "string", required: true },
  },
}
```

### Response Specification

Always include at least the success response:

```typescript
responses: {
  200: {
    description: "Success",
    content: {
      "application/json": {
        schema: OutputSchema,
      },
    },
  },
}
```

For paginated responses:

```typescript
responses: {
  200: {
    description: "Success", 
    content: {
      "application/json": {
        schema: z.object({
          users: z.array(UserSchema),
          pagination: PaginationSchema,
        }),
      },
    },
  },
}
```

## Including Error Responses

Use the common error responses from `schemas/common.ts`:

```typescript
import { commonErrorResponses } from "../../schemas/common.js";

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
  // ... other fields
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: AdminUserSchema,
        },
      },
    },
    ...commonErrorResponses, // Includes 400, 401, 403, 404, 409, 429, 500
  },
});
```

Or include specific error responses:

```typescript
responses: {
  200: { /* success response */ },
  400: commonErrorResponses[400],
  401: commonErrorResponses[401], 
  403: commonErrorResponses[403],
}
```

## Schema Registration

OpenAPI schemas are collected in `/src/http/openapi.ts`:

1. Import the schema:
```typescript
import { registerOpenApi as regAdminUserCreate } from "../controllers/admin/adminUserCreate.js";
```

2. Add to the generator:
```typescript
const registry = new OpenAPIRegistry();
regAdminUserCreate(registry);
// add more controller registrations here
```

3. The OpenAPI document will be available at `/openapi` on the admin server.

## Tag Conventions

Use consistent tags to group related endpoints:

- `"Admin Users"` - Admin user management
- `"Users"` - Regular user management  
- `"Groups"` - Group management
- `"Clients"` - OAuth client management
- `"Auth"` - Authentication endpoints
- `"Settings"` - System settings

## Example: Complete GET Endpoint

```typescript
import { createRouteSpec } from "@asteasolutions/zod-to-openapi";
import { UserSchema, PaginationSchema } from "../../schemas/index.js";
import { commonErrorResponses } from "../../schemas/common.js";

export async function getUsers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  // Implementation...
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
  method: "get",
  path: "/admin/users",
  tags: ["Users"],
  summary: "List users",
  request: {
    query: {
      page: { type: "number", required: false },
      limit: { type: "number", required: false },
      search: { type: "string", required: false },
    },
  },
  responses: {
    200: {
      description: "List of users with pagination",
      content: {
        "application/json": {
          schema: z.object({
            users: z.array(UserSchema.extend({
              groups: z.array(z.string()),
            })),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
```

## Example: Complete POST Endpoint

```typescript
import { createRouteSpec } from "@asteasolutions/zod-to-openapi";
import { CreateAdminUserSchema, AdminUserSchema } from "../../schemas/adminUsers.js";
import { commonErrorResponses } from "../../schemas/common.js";

export async function createAdminUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  // Implementation...
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
  method: "post", 
  path: "/admin/admin-users",
  tags: ["Admin Users"],
  summary: "Create a new admin user",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateAdminUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Admin user created successfully",
      content: {
        "application/json": {
          schema: AdminUserSchema,
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401], 
    403: commonErrorResponses[403],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});
```

## Best Practices

1. **Schema Reuse**: Use the same Zod schemas for validation and OpenAPI documentation
2. **Error Responses**: Always include relevant error responses using `commonErrorResponses`
3. **Descriptions**: Provide meaningful descriptions for responses
4. **Tags**: Use consistent tags to group related endpoints
5. **Registration**: Don't forget to register new schemas in `createServer.ts`
6. **Validation**: Ensure the OpenAPI spec matches actual controller behavior
7. **Examples**: Consider adding example values for complex schemas

## Accessing Documentation

Once registered, the OpenAPI documentation is available at:
- JSON format: `http://localhost:[admin-port]/openapi`
- Swagger UI: Import the JSON into any OpenAPI viewer

## Adding New Endpoints

To add OpenAPI documentation to a new endpoint:

1. Create the controller function
2. Define input/output schemas in appropriate schema file
3. Export `openApiSchema` from the controller file
4. Import and register the schema in `createServer.ts`
5. Test the `/openapi` endpoint to verify the documentation

The generated documentation will automatically stay in sync with your validation schemas, ensuring accuracy and reducing maintenance overhead.