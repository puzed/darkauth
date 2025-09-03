# Naming Conventions

This document outlines the naming conventions used throughout the DarkAuth codebase to maintain consistency and readability.

## Overview

DarkAuth follows a consistent naming policy that prioritizes clarity and avoids abbreviations internally, while preserving protocol-specific field naming at system boundaries.

## Core Principle

**No abbreviations internally; protocol fields preserved at boundaries**

- **Internal code**: Use full, descriptive names (e.g., `adminUser`, `passwordResetRequired`)
- **External boundaries**: Preserve protocol-specific naming (e.g., `client_id`, `redirect_uri`)

## File and Directory Naming

### Files
- Use kebab-case for file names: `admin-users.ts`, `password-reset.ts`
- Controller files describe the action: `adminUserCreate.ts`, `adminUserUpdate.ts`
- Schema files match the domain: `adminUsers.ts`, `auth.ts`

### Directories  
- Use kebab-case: `admin-ui/`, `user-ui/`
- Use descriptive names: `controllers/`, `schemas/`, `services/`

## Variable and Function Naming

### Variables
Use camelCase with descriptive names:

```typescript
// Good
const adminUser = await getAdminUser(id);
const passwordResetRequired = user.passwordResetRequired;
const authorizationCode = generateCode();

// Avoid
const usr = await getUser(id);  // Too abbreviated
const pwdRst = user.resetReq;   // Unclear abbreviations
const authCode = genCode();     // Shortened unnecessarily
```

### Functions
Use camelCase with verb-noun patterns:

```typescript
// Good
async function createAdminUser(context, userData) { }
async function validateAuthorizationRequest(request) { }
async function generateAccessToken(claims) { }

// Avoid  
async function makeUser() { }     // Vague verb
async function authReq() { }      // Abbreviated
async function process() { }      // Generic verb
```

## Schema Naming

### Schema Constants
Use PascalCase ending with "Schema":

```typescript
export const AdminUserSchema = z.object({ });
export const CreateAdminUserSchema = z.object({ });
export const AuthorizationRequestSchema = z.object({ });
export const ValidationErrorResponseSchema = z.object({ });
```

### Type Names
Infer from schemas without "Schema" suffix:

```typescript
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type CreateAdminUser = z.infer<typeof CreateAdminUserSchema>;
export type AuthorizationRequest = z.infer<typeof AuthorizationRequestSchema>;
```

## Database Schema Naming

### Table Names
Use snake_case (PostgreSQL convention):

```typescript
export const adminUsers = pgTable("admin_users", {
  // fields...
});

export const oauthClients = pgTable("oauth_clients", {
  // fields...  
});
```

### Column Names  
Use snake_case in database, camelCase in TypeScript:

```typescript
export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordResetRequired: boolean("password_reset_required").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Protocol Field Preservation

### OAuth/OIDC Fields
Preserve standard protocol naming:

```typescript
// OAuth Authorization Request - keep underscore naming
export const AuthorizationRequestSchema = z.object({
  client_id: z.string().min(1),           // Standard field name
  redirect_uri: z.string().url(),         // Standard field name  
  response_type: z.literal("code"),       // Standard field name
  code_challenge: z.string().optional(),  // PKCE standard
  code_challenge_method: z.literal("S256").optional(),
});

// Token Request - keep underscore naming
export const TokenRequestSchema = z.object({
  grant_type: z.string().min(1),          // Standard field name
  client_id: z.string().optional(),       // Standard field name
  client_secret: z.string().optional(),   // Standard field name
  refresh_token: z.string().optional(),   // Standard field name
});
```

### JWT Claims
Preserve standard claim names:

```typescript
const claims = {
  sub: user.id,        // Subject - standard claim
  iss: issuer,         // Issuer - standard claim  
  aud: audience,       // Audience - standard claim
  exp: expiration,     // Expires - standard claim
  iat: issuedAt,       // Issued at - standard claim
};
```

## Controller Naming

### Controller Files
Use descriptive action names:

```typescript
// Good naming
adminUserCreate.ts      // Creates admin users
adminUserUpdate.ts      // Updates admin users  
adminUserDelete.ts      // Deletes admin users
adminUserPasswordReset.ts // Resets admin user passwords

// Export functions with Controller suffix for clarity
export async function createAdminUserController() { }
export async function updateAdminUserController() { }
```

### Route Handlers
Use descriptive function names:

```typescript
// Good
export async function getAdminUsers() { }
export async function createAdminUser() { }
export async function deleteAdminUser() { }

// Avoid generic names
export async function handler() { }
export async function process() { }
```

## OpenAPI Schema Naming

### Tags
Use title-case with spaces:

```typescript
tags: ["Admin Users"]     // Not "admin-users" or "AdminUsers"
tags: ["OAuth Clients"]   // Not "oauth-clients"  
tags: ["User Management"] // Not "user_management"
```

### Summary and Description
Use sentence case:

```typescript
summary: "Create admin user"           // Not "Create Admin User"
summary: "List OAuth clients"         // Not "List oauth clients"
description: "Creates a new admin user with the specified role"
```

## Error Naming  

### Error Classes
Use descriptive names ending in "Error":

```typescript
class ValidationError extends AppError { }
class AuthenticationError extends AppError { }  
class AuthorizationError extends AppError { }
class NotFoundError extends AppError { }
```

### Error Codes
Use SCREAMING_SNAKE_CASE:

```typescript
const errorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED", 
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
};
```

## Service Naming

### Service Files
Use descriptive domain names:

```typescript
// Good
sessions.ts      // Session management
encryption.ts    // Cryptographic operations
zkDelivery.ts    // Zero-knowledge delivery service
opaqueAuth.ts    // OPAQUE authentication

// Avoid abbreviations  
auth.ts          // Too generic
crypto.ts        // Too abbreviated
```

### Service Functions
Use clear action names:

```typescript
// Good
export async function createSession(context, userId) { }
export async function validateSession(context, sessionId) { }
export async function encryptWithKek(data, kek) { }

// Avoid
export async function process(context, data) { }  // Too generic
export async function encrypt(data) { }           // Missing context
```

## Configuration Naming

### Environment Variables
Use SCREAMING_SNAKE_CASE:

```bash
DATABASE_URL=postgresql://...
ADMIN_PORT=5555
USER_PORT=5556
ENCRYPTION_PASSPHRASE=...
```

### Config Properties
Use camelCase in TypeScript:

```typescript
interface Config {
  databaseUrl: string;
  adminPort: number;
  userPort: number;
  encryptionPassphrase: string;
  isDevelopment: boolean;
}
```

## Best Practices Summary

1. **Clarity over brevity**: Use `adminUser` instead of `user` when context matters
2. **Consistency**: Follow the same patterns throughout the codebase
3. **Protocol compliance**: Preserve external standard field names
4. **Descriptive actions**: Use verb-noun patterns for functions
5. **Avoid abbreviations**: Write `password` not `pwd`, `request` not `req`
6. **Case conventions**: 
   - camelCase for variables/functions
   - PascalCase for types/schemas
   - kebab-case for files
   - snake_case for database
   - SCREAMING_SNAKE_CASE for constants

## Migration Guidelines

When refactoring existing code:

1. **Internal names**: Change abbreviations to full names
2. **External interfaces**: Keep protocol field names unchanged  
3. **Database**: Maintain existing column names for compatibility
4. **APIs**: Preserve public interface field names

This ensures internal code clarity while maintaining compatibility with external systems and standards.