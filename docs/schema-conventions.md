# Schema Conventions

This document outlines the schema conventions used throughout the DarkAuth project for input validation, output serialization, and data transformation.

## Overview

DarkAuth uses [Zod](https://zod.dev/) for runtime schema validation and type safety. Schemas are co‑located with controllers so each route defines the inputs/outputs it needs close to the handler. Controllers also export an OpenAPI registration function to include their routes in the generated docs.

## Schema Organization

Schemas are organized by domain in separate files:

- `schemas/adminUsers.ts` - Admin user management schemas
- `schemas/users.ts` - Regular user schemas  
- `schemas/groups.ts` - Group management schemas
- `schemas/auth.ts` - Authentication and authorization schemas
- `schemas/common.ts` - Shared schemas and error responses

## Schema Patterns

### Base Entity Schemas

Base schemas represent the full entity structure and are used for output serialization:

```typescript
export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
  passwordResetRequired: z.boolean().optional(),
  createdAt: z.date().or(z.string()),
});
```

### Input Schemas

Input schemas are derived from base schemas for specific operations:

```typescript
// Creation - required fields only
export const CreateAdminUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
});

// Updates - all fields optional
export const UpdateAdminUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),  
  role: AdminRoleSchema.optional(),
});
```

### Type Inference

TypeScript types are inferred from schemas to maintain consistency:

```typescript
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type CreateAdminUser = z.infer<typeof CreateAdminUserSchema>;
export type UpdateAdminUser = z.infer<typeof UpdateAdminUserSchema>;
```

## Validation in Controllers

Controllers use `safeParse` for validation and throw structured errors:

```typescript
const parsed = CreateAdminUserSchema.safeParse(raw);
if (!parsed.success) {
  throw new ValidationError("Validation error", parsed.error.errors);
}
```

### Input Processing

Input data is often transformed during validation:

```typescript
const adminUser = await createAdminUser(context, {
  email: parsed.data.email.trim().toLowerCase(),
  name: parsed.data.name.trim(),
  role: parsed.data.role,
});
```

## Common Schemas

### Error Responses

The `common.ts` file provides standardized error response schemas:

```typescript
export const ValidationErrorResponseSchema = z.object({
  error: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  code: z.literal("VALIDATION_ERROR"),
  details: z.any().optional(),
});
```

### Pagination

Pagination schemas support consistent list endpoints:

```typescript
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const PaginationQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 20),
  search: z.string().optional(),
});
```

### Paginated Response Helper

A helper function creates paginated response schemas:

```typescript
export function createPaginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });
}
```

## Data Transformation

### Date Handling

Schemas accommodate both Date objects and ISO strings:

```typescript
createdAt: z.date().or(z.string())
```

### Query Parameter Parsing

Query parameters are transformed from strings to appropriate types:

```typescript
page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1)
```

### Optional Fields

Use `.optional()` for truly optional fields and `.nullable().optional()` for fields that can be null or undefined:

```typescript
email: z.string().email().nullable().optional(),
passwordResetRequired: z.boolean().optional(),
```

## Protocol Field Preservation

When dealing with OAuth/OIDC protocol fields, preserve the original naming conventions:

```typescript
export const AuthorizationRequestSchema = z.object({
  client_id: z.string().min(1),      // Keep underscore naming
  redirect_uri: z.string().url(),    // Keep underscore naming
  response_type: z.literal("code"),  // Keep underscore naming
  // ... other protocol fields
});
```

This preserves compliance with external specifications while maintaining internal consistency.

## Best Practices

1. **Centralization**: Keep all schemas in the `/src/schemas/` directory
2. **Naming**: Use descriptive names ending in "Schema" (e.g., `CreateAdminUserSchema`)
3. **Validation**: Always use `safeParse` in controllers, never `parse`
4. **Types**: Infer TypeScript types from schemas using `z.infer<>`
5. **Reuse**: Share common schemas like pagination and error responses
6. **Transformation**: Use `.transform()` for data processing during validation
7. **Protocol Compliance**: Preserve external protocol field naming conventions
8. **Documentation**: Document complex validation rules with comments

## Integration with OpenAPI

Schemas integrate seamlessly with OpenAPI documentation through the shared `ControllerSchema` exports and the `zod/v4` `toJSONSchema` helper. See [OpenAPI Contribution Pattern](./openapi-patterns.md) for details on how schemas feed the generated documentation.
