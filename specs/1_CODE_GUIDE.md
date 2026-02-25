# NodeJS Code Guide

## Overview

This guide describes how to build a functional, minimal dependency Node.js project using the context pattern. The context pattern provides dependency injection without frameworks, making testing easy and keeping the codebase simple.

## Project Structure

```markdown
project/
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── createServer.ts
│   │   │   ├── createContext.ts
│   │   │   ├── types.ts
│   │   │   ├── errors.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrate.ts
│   │   │   ├── schemas/
│   │   │   │   ├── users.ts
│   │   │   │   └── posts.ts
│   │   │   ├── utils/
│   │   │   │   └── http.ts
│   │   │   ├── models/
│   │   │   │   ├── users.ts
│   │   │   │   └── posts.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.ts
│   │   │   │   └── email.ts
│   │   │   └── controllers/
│   │   │       ├── users/
│   │   │       │   ├── get.ts
│   │   │       │   ├── post.ts
│   │   │       │   └── [userId]/
│   │   │       │       ├── get.ts
│   │   │       │       └── put.ts
│   │   │       └── posts/
│   │   │           ├── get.ts
│   │   │           ├── post.ts
│   │   │           └── [postId]/
│   │   │               ├── get.ts
│   │   │               └── put.ts
│   │   ├── tests/
│   │   │   ├── helpers/
│   │   │   │   └── createTestServer.ts
│   │   │   ├── models/
│   │   │   │   └── users.test.ts
│   │   │   └── controllers/
│   │   │       └── users/
│   │   │           ├── get.test.ts
│   │   │           ├── post.test.ts
│   │   │           └── [userId]/
│   │   │               ├── get.test.ts
│   │   │               └── put.test.ts
│   │   ├── drizzle/
│   │   │   └── migrations/
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── ui/
│   │   ├── src/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── admin-ui/
│       ├── src/
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json
└── tsconfig.json
```

## Core Concepts

- Use the context pattern instead of complex dependency injection frameworks.
- Prefer local, explicit code first. Introduce abstractions only when repetition or mixed concerns clearly justify them.
- Comments should be rarely be needed as code should be written to be self-documenting.
- Comments should be used to explain why a unintuitive code block or hack is needed, not what it does.
- Avoid unclear abbreviations. Standard technical abbreviations (`db`, `url`, `id`, `api`) are acceptable.
- Use `type` aliases instead of `interface`. `interface` declaration merging is implicit/global magic and is not allowed.
- Prefer built in Node functionality over third party libraries.
- Only mock external systems, not the internal ones this project needs. For example, don't mock our postgres database, use a real one in the tests. But it would be okay to mock the Twilio API, it's a third party.
 - UI packages (ui and admin-ui) are built with React + TypeScript + CSS Modules and compiled to static assets served by the Node HTTP server. Do not introduce server-side rendering frameworks.
- Use npm workspaces to manage the monorepo structure with separate packages for api, ui, and admin-ui.

### Abstraction Discipline

- Do not abstract on first implementation. Write the straightforward version first.
- Usually do not abstract on second implementation either. Confirm the pattern is stable.
- Abstract on repeated, stable patterns (typically the third time) or when an extraction clearly reduces cognitive load in a hot file.
- Every abstraction must reduce complexity at call sites; if it only moves complexity, remove it.
- Avoid speculative helper layers and pass-through wrappers.

Good abstractions in this code style:
- `utils/createRouter.ts` to keep request routing/validation/error translation out of `createServer.ts`.
- `utils/waitForHealth.ts` to keep readiness polling out of server lifecycle orchestration.

When to keep code inline:
- One-off logic with a single call site.
- Logic that is clearer where it is used than behind a generic helper.

Server factory rule:
- If you run a single HTTP server, keep a single `createServer(...)` factory.
- Do not add nested server factories like `createApiServer(...)` unless you actually run multiple distinct servers with distinct responsibilities.

### Server Lifecycle And Portability

- Projects may run one or many HTTP servers. Treat all HTTP servers uniformly: each server must be portable, restartable, and stoppable.
- Tests and production must use the same server factory and lifecycle API.
- Do not rely on globals for server state. All resources live in context and are created/destroyed via explicit lifecycle calls.

Lifecycle API (conceptual):
- createServer(context) returns an object exposing: start(), stop(), restart(), context, and references to all running HTTP servers.
- start() resolves only when all HTTP servers are bound on their configured ports and report healthy via a readiness endpoint.
- stop() resolves only when all HTTP servers are closed, open sockets destroyed, timers cleared, and resources released. No leaks.
- restart() = stop and then start the same managed server instance on the same ports, then wait for readiness.
- If you need a brand‑new context/server graph, call stop(), construct a new server via createServer(...), then start() it.
- Ports per server are defined in config and must remain stable across restarts. Avoid hard‑coded port numbers.

Readiness and health:
- Every HTTP server exposes a lightweight health endpoint for readiness checks used by start/restart and tests.
- Health/readiness endpoints are normal routed endpoints implemented through the same `routes` table and controller file conventions.
- Callers should not insert arbitrary sleeps; lifecycle methods guarantee readiness before resolving.

### Controllers And Models

- Controllers live in files following `controllers/{entity}/{optionalSegment}/{method}.ts`, for example `controllers/users/[userId]/get.ts`.
- Controllers are thin HTTP adapters. They parse input, enforce authentication and authorization, call models and services, and shape HTTP responses. They contain no database logic.
- HTTP routing uses `URLPattern` objects for declarative matching. Each route declares a method and `URLPattern`, and handlers receive parsed parameters from the pattern match.
- Routers should parse and validate route params/query only. Controllers own request-body parsing (for example via `getBodyFromRequest(context, request, mode, options?)`).
- Do not special-case endpoints in `createServer` (including `/health`, `/ready`, `/openapi`). If an endpoint exists, it must be declared in the route table and handled by a controller.
- Models encapsulate domain and data logic. They validate inputs relevant to the domain, perform all database access, apply invariants, and return plain data objects. They contain no HTTP concerns.
- Controllers register OpenAPI via zod schemas and map domain data from models to the response. OpenAPI types describe the external shape; model types describe the internal domain.
- Types used by models are defined with zod and inferred types near the model functions, or shared in `schemas/` when reused by multiple callers. Controllers import those types to validate I/O, but do not redefine domain types.
- Permissions and cohort checks exist only in controllers (or explicit auth helper functions called by controllers). Models should assume the caller is authorized.
- Services handle external protocols or multi-step processes (e.g. email or payments). Prefer orchestrating services from controllers (or dedicated service/orchestrator functions). Models should not trigger cross-boundary side effects (email, queues, third-party APIs). If a workflow requires side effects alongside data changes, expose a service like `registerUser` that composes model calls and invokes side effects explicitly.

Rules:
- No direct `context.db` usage in controllers. All reads and writes go through a model or service.
- Controllers may compose multiple model calls but never reach into tables.
- Models return simple data that the controller can send directly or transform for HTTP.
- When adding a feature, start by defining model functions, then wire a controller that validates input, authorizes, calls the model, and documents via OpenAPI.

#### Model Responsibilities

Models own all data access and business rules. They are the single source of truth for how data is retrieved, created, updated, and deleted.

Models should:
- Contain all database queries and operations
- Handle data validation and business logic
- Implement data transformation and aggregation
- Manage relationships between entities
- Provide clean, typed interfaces for data access
- Handle pagination, filtering, and search logic
- Throw appropriate errors (`NotFoundError`, `ConflictError`, `ValidationError`, etc.)
- Be deterministic functions with explicit dependencies that take `Context` as the first parameter

Models should NOT:
- Handle HTTP requests/responses
- Manage authentication/authorization
- Deal with OpenAPI specifications
- Parse query parameters or request bodies
 - Trigger external side effects (email, queues, third‑party APIs)

#### Controller Responsibilities

Controllers are thin HTTP layers that coordinate between the transport (HTTP), authentication, and models.

Controllers should:
- Handle HTTP request/response lifecycle
- Parse and validate query parameters and request bodies
- Manage authentication and authorization (via explicit session/auth helpers)
- Call appropriate model functions with validated data
- Handle OpenAPI specification registration
- Transform model responses for HTTP responses
- Let error handling bubble to the top-level HTTP error handler

Controllers should NOT:
- Contain database queries or business logic
- Handle complex data transformations
- Implement pagination or filtering logic
- Manage database transactions directly

#### Model–Controller Relationship

Pattern:

```typescript
// Controller (HTTP layer)
export async function getUsersController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  query: { page?: string; limit?: string; search?: string },
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) throw new ForbiddenError("Admin access required");

  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 20;
  const search = query.search;

  const result = await listUsers(context, { page, limit, search: search || undefined });
  sendJsonValidated(response, 200, result, UsersListResponseSchema);
}

// Model (Data layer)
export async function listUsers(
  context: Context,
  options: { page?: number; limit?: number; search?: string } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  // Complex queries, joins, aggregations
  const users = await context.db.select(/* ... */).from(/* ... */).limit(limit).offset(offset);
  return { users, pagination: { /* ... */ } };
}
```

#### Type Safety Between Layers

Use zod schemas for external API types, and clean TypeScript types for model results.

```typescript
// schemas/users.ts – external API types
export const UserSchema = z.object({
  sub: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  createdAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

// models/users.ts – database operations with types
export async function listUsers(context: Context, options: ListUsersOptions): Promise<ListUsersResult> {
  // ...
}

// controllers/users/get.ts – HTTP handling
export async function getUsersController(context: Context, request: IncomingMessage, response: ServerResponse) {
  const result = await listUsers(context, options);
  sendJsonValidated(response, 200, result, UsersListResponseSchema);
}
```

#### Error Handling

- Models: throw business logic errors (`NotFoundError`, `ConflictError`, `ValidationError`).
- Controllers: validate inputs and allow errors to bubble to the HTTP error handler.

#### Testing Strategy

- Model tests: data operations, business rules, edge cases.
- Controller tests: HTTP handling, authentication, input validation, OpenAPI shapes.
- Integration tests: end-to-end from HTTP to database using real dependencies where possible.

### 1. Context Pattern

The context object contains all dependencies (database, services, config) and is passed to every function. This enables:
- Easy testing by mocking (external) dependencies
- No global state
- Explicit dependencies
- Simple dependency injection

### 2. Single Function Exports

Each file exports individual functions, not classes or objects. Functions take context as their first parameter.

### 3. Error Handling

Use AppError for application-specific errors that bubble up to the HTTP layer for proper handling.

## Implementation

### UI Guidelines
- React + TypeScript + CSS Modules.
- No runtime CSS-in-JS. Keep styles co-located via Modules.
- Build with a minimal bundler (e.g., Vite). Output is static and served by the Node HTTP server.
- Apply a strict CSP; no inline scripts or styles. Prefer hashed/script-src only when unavoidable.

### Server Lifecycle Guarantees
- Use a single entrypoint that builds config, constructs a fresh context, and then builds servers using the shared factory.
- Never swallow lifecycle errors; surface them and fail fast in dev/test. Logs must include the failing phase (start/stop/restart).
- Track and destroy open sockets per server on stop to avoid close hangs.
- All background timers, intervals, DB pools, and service instances are owned by context and registered for cleanup.

Background work safety:
- When a server is stopping or restarting, nothing spawned from that server may continue once context is stopping/closed. This includes background jobs, queues, schedulers, and loggers.
- Provide a liveness/closed signal on context. Background tasks must check it and abort when context is stopping or closed.
- If your application performs a full context rebuild (stop + new createServer), use an instance/version token to detect stale work from older instances.
- If work must survive restart, flush it before stop or persist it to a durable queue and resume after start.
- Never write to databases, queues, or files using a closed or stale context.

Fresh context policy:
- Rebuilding a fresh context is an explicit operation by creating a new server instance after stop(), not an implicit requirement of restart().
- When rebuilding, source config from env/config files and recreate pools/services from scratch.

Readiness workflow:
- start() resolves only when all servers report healthy.
- stop() resolves only when all servers are closed and resources are cleaned.
- restart() resolves only when the restarted server is healthy on the same ports.


### types.ts
```typescript
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './db/schema';

export type Context = {
  db: NodePgDatabase<typeof schema>;
  config: Config;
  services: Services;
  destroy: () => Promise<void>;
};

export type Services = {
  emailProvider?: {
    send: (options: { to: string; subject: string; html: string }) => Promise<{ messageId: string }>;
  };
  paymentProvider?: {
    createCharge: (amount: number, token: string) => Promise<{ id: string; status: string }>;
  };
};

export type Config = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  publicBaseUrl: string;
  maxBodyBytes: number;
};

export type ControllerSchema = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
};
```

### Ports And Bindings
- Define ports per server in config (by name if multiple). Do not hard‑code numeric ports in code.
- Keep bindings stable across restarts so clients and tests can rely on addresses.
- Local dev defaults (if any) belong in `.env.example` or docs, not runtime fallbacks in production code.

### No Runtime Defaults
- Prefer explicit configuration over implicit behavior.
- Do not use runtime fallback values for configuration (`||`, `??`, default params, or schema `.default(...)`) for app settings.
- Missing configuration should fail fast during startup with a clear error.
- This applies to security and non-security settings (ports, feature flags, titles, limits, etc).
- Put sample values in `.env.example` and documentation, not in executable runtime defaults.
- Database-level defaults for persisted columns are allowed when intentional (`defaultNow`, `defaultRandom`, etc); this rule is about runtime app configuration.

Example:
```env
# .env.example
SITE_TITLE="Example Site"
```

```typescript
// Good
const ConfigSchema = z.object({
  siteTitle: z.string().min(1),
});

const config = ConfigSchema.parse({
  siteTitle: process.env.SITE_TITLE,
});

// Bad
const siteTitle = process.env.SITE_TITLE || "Example Site";
```

### Security Defaults
- Never ship insecure fallback secrets (for example `JWT_SECRET='development-secret'` in runtime code).
- Fail fast at startup when required secrets/config values are missing.
- Treat `Host` as untrusted input; never use it for security decisions or canonical URL generation.

### errors.ts
- Note: this is one of the very rare times a class is appropriate in a functional project.

We should bubble errors up from controllers, models, etc to the HTTP layer, where they can be handled appropriately. This allows us to return meaningful error responses to the client.

That means we rarely need to try/catch, unless we are trying to catch a specific error type to then convert it to an AppError. Any other errors should bubble up to the HTTP layer where they can be handled appropriately. AppErrors can be responded to the client with a specific status code and message (if status is given), while other errors can be logged and a generic 500 error can be returned.

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}
```

### db/schema.ts
```typescript
import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  published: boolean('published').default(false).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));
```

### schemas/users.ts
```typescript
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from '../db/schema';

// Base schemas generated from Drizzle table
const selectUserSchema = createSelectSchema(users);
const insertUserSchema = createInsertSchema(users);

// API response schemas (what we expose externally)
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  createdAt: z.date(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

export const UpdateUserSchema = CreateUserSchema.partial();

// Type exports
export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

// Database to API transformation
export function toApiUser(dbUser: typeof selectUserSchema._type) {
  return UserSchema.parse({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    createdAt: dbUser.createdAt,
  });
}
```

### schemas/posts.ts
```typescript
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { posts } from '../db/schema';
import { UserSchema } from './users';

// Base schemas
const selectPostSchema = createSelectSchema(posts);
const insertPostSchema = createInsertSchema(posts);

// API schemas
export const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  userId: z.string().uuid(),
  published: z.boolean(),
  viewCount: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PostWithUserSchema = PostSchema.extend({
  user: UserSchema,
});

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  userId: z.string().uuid(),
});

export const UpdatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  published: z.boolean().optional(),
});

export const ListPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
  offset: z.coerce.number().int().min(0),
  published: z.coerce.boolean().optional(),
});

// Type exports
export type Post = z.infer<typeof PostSchema>;
export type PostWithUser = z.infer<typeof PostWithUserSchema>;
export type CreatePost = z.infer<typeof CreatePostSchema>;
export type UpdatePost = z.infer<typeof UpdatePostSchema>;
export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;
```

### createContext.ts
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Context, Config } from './types';
import * as schema from './db/schema';

export function createContext(config: Config) {
  const cleanupFunctions: Array<() => Promise<void> | void> = [];

  const pool = new Pool({
    connectionString: config.databaseUrl,
  });

  const db = drizzle(pool, { schema });

  cleanupFunctions.push(async () => {
    await pool.end();
  });

  return {
    db,
    config,
    services: {
      // Initialize real services here in production
      // emailProvider: createEmailProvider(config),
      // paymentProvider: createPaymentProvider(config),
    },
    async destroy() {
      for (const cleanup of cleanupFunctions) {
        await cleanup();
      }
    },
  };
}
```

### createServer.ts

```typescript
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { Context } from './types';
import { AppError } from './errors';
import { readBody, parseJsonSafely } from './utils/http';

type AnyZod = z.ZodTypeAny;

type InferField<TSchema extends AnyZod, K extends 'params' | 'body' | 'query'> =
  K extends keyof z.infer<TSchema> ? z.infer<TSchema>[K] : undefined;

export type Handler<
  TSchema extends AnyZod,
  TContext = Context,
  TRequest extends IncomingMessage = IncomingMessage,
  TResponse extends ServerResponse<TRequest> = ServerResponse<TRequest>
> = {
  context: TContext;
  request: TRequest;
  response: TResponse;
  params: InferField<TSchema, 'params'>;
  body: InferField<TSchema, 'body'>;
  query: InferField<TSchema, 'query'>;
};

type ControllerModule<TSchema extends AnyZod = AnyZod> = {
  schema: TSchema;
  handler: (args: Handler<TSchema>) => unknown | Promise<unknown>;
};

type Route = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: URLPattern;
  controller: Promise<ControllerModule>;
};

const routes: Route[] = [
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/users' }),
    controller: import('./controllers/users/get'),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/users' }),
    controller: import('./controllers/users/post'),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/users/:userId' }),
    controller: import('./controllers/users/[userId]/get'),
  },
  {
    method: 'PUT',
    pattern: new URLPattern({ pathname: '/users/:userId' }),
    controller: import('./controllers/users/[userId]/put'),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/posts' }),
    controller: import('./controllers/posts/get'),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/posts' }),
    controller: import('./controllers/posts/post'),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/posts/:postId' }),
    controller: import('./controllers/posts/[postId]/get'),
  },
  {
    method: 'PUT',
    pattern: new URLPattern({ pathname: '/posts/:postId' }),
    controller: import('./controllers/posts/[postId]/put'),
  },
];

function handleError(error: unknown, response: ServerResponse) {
  if (error instanceof z.ZodError) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      }),
    );
    return;
  }

  if (error instanceof AppError) {
    response.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message, code: error.code }));
    return;
  }

  console.error('Unhandled error', error);
  response.writeHead(500, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' }));
}

export function createServer(context: Context) {
  return http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid request URL', code: 'INVALID_REQUEST' }));
        return;
      }

      // Do not trust Host header; use configured base URL for parsing only.
      const baseUrl = context.config.publicBaseUrl;
      const url = new URL(request.url, baseUrl);
      for (const route of routes) {
        if (request.method !== route.method) continue;

        const match = route.pattern.exec({ pathname: url.pathname });
        if (!match) continue;

        const controller = await route.controller;
        const schema = controller.schema as z.ZodObject<any> | undefined;
        const paramsSchema = schema?.shape?.params as z.ZodTypeAny | undefined;
        const querySchema = schema?.shape?.query as z.ZodTypeAny | undefined;

        const params = paramsSchema
          ? paramsSchema.parse(match.pathname.groups ?? {})
          : {};

        const query = querySchema
          ? querySchema.parse(Object.fromEntries(url.searchParams.entries()))
          : {};

        await controller.handler({
          context,
          request,
          response,
          params,
          query,
        } as Handler<typeof controller.schema>);
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }));
    } catch (error) {
      handleError(error, response);
    }
  });
}
```

The routing system uses dynamic imports for controllers, validates route params/query, and passes `request` through so controllers can parse and validate body content explicitly. In this style, handler payloads are runtime-validated at the router/controller boundary and can be narrowed further inside controllers as needed.

Frameworkless routing is only justified if we can measure value. Track:
- Cold start time and p95 request latency versus a framework baseline.
- Bundle/runtime dependency count and security advisories.
- Developer onboarding time for adding a new endpoint.
- Defect rate in HTTP edge-cases (parsing, status codes, headers, timeouts).

### main.ts
```typescript
import { createContext } from './createContext';
import { createServer } from './createServer';
import { once } from 'events';
import type { Server } from 'http';
import { z } from 'zod';

const RuntimeConfigSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  MAX_BODY_BYTES: z.coerce.number().int().positive(),
});

function loadConfig() {
  const env = RuntimeConfigSchema.parse(process.env);
  return {
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    maxBodyBytes: env.MAX_BODY_BYTES,
  };
}

type ManagedServer = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
};

function createManagedServer(): ManagedServer {
  let context = createContext(loadConfig());
  let server: Server = createServer(context);
  const sockets = new Set<import('net').Socket>();

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  async function start() {
    server.listen(context.config.port);
    await once(server, 'listening');
  }

  async function stop() {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await context.destroy();
  }

  async function restart() {
    await stop();
    context = createContext({ ...context.config });
    server = createServer(context);
    await start();
  }

  return { start, stop, restart };
}

async function main() {
  const managed = createManagedServer();
  await managed.start();

  const shutdown = async () => {
    await managed.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
```

### models/users.ts
```typescript
import { eq, ilike, or } from 'drizzle-orm';
import { Context } from '../types';
import { ConflictError } from '../errors';
import { users } from '../db/schema';
import {
  User,
  CreateUser,
  UpdateUser,
  CreateUserSchema,
  UpdateUserSchema,
  toApiUser,
} from '../schemas/users';

export async function listUsers(
  context: Context,
  options: { limit?: number; offset?: number; search?: string } = {},
): Promise<User[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);

  const where = options.search
    ? or(
        ilike(users.email, `%${options.search}%`),
        ilike(users.name, `%${options.search}%`),
      )
    : undefined;

  const rows = await context.db
    .select()
    .from(users)
    .where(where)
    .limit(limit)
    .offset(offset);

  return rows.map(toApiUser);
}

export async function findUserById(context: Context, userId: string): Promise<User | null> {
  const row = await context.db.query.users.findFirst({ where: eq(users.id, userId) });
  return row ? toApiUser(row) : null;
}

export async function findUserByEmail(context: Context, email: string): Promise<User | null> {
  const row = await context.db.query.users.findFirst({ where: eq(users.email, email) });
  return row ? toApiUser(row) : null;
}

export async function createUser(context: Context, data: CreateUser): Promise<User> {
  const valid = CreateUserSchema.parse(data);

  const existing = await findUserByEmail(context, valid.email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const [row] = await context.db.insert(users).values(valid).returning();
  return toApiUser(row);
}

export async function updateUser(
  context: Context,
  userId: string,
  data: UpdateUser,
): Promise<User | null> {
  const valid = UpdateUserSchema.parse(data);

  const [row] = await context.db
    .update(users)
    .set({ ...valid, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return row ? toApiUser(row) : null;
}

export async function deleteUser(context: Context, userId: string): Promise<boolean> {
  const [row] = await context.db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  return Boolean(row);
}
```

### controllers/users/get.ts
```typescript
import { z } from 'zod';
import type { Handler } from '../../createServer';
import { listUsers } from '../../models/users';

export const schema = z.object({
  params: z.object({}),
  query: z
    .object({
      search: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
});

export async function handler({ context, response, query }: Handler<typeof schema>) {
  const users = await listUsers(context, query ?? {});

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(users));
}
```

### controllers/users/[userId]/get.ts
```typescript
import { z } from 'zod';
import type { Handler } from '../../../createServer';
import { NotFoundError } from '../../../errors';
import { findUserById } from '../../../models/users';

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid({ message: 'Invalid user ID format' }),
  }),
});

export async function handler({ context, params, response }: Handler<typeof schema>) {
  const user = await findUserById(context, params.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(user));
}
```

### controllers/users/[userId]/put.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../../createServer";
import { updateUser } from "../../../models/users";
import { NotFoundError } from "../../../errors";
import { UpdateUserSchema } from "../../../schemas/users";

export const schema = z.object({
  params: z.object({
    userId: z.string().uuid({ message: 'Invalid user ID format' }),
  }),
  body: UpdateUserSchema,
});

export async function handler({ context, params, body, response }: Handler<typeof schema>) {
  const updatedUser = await updateUser(context, params.userId, body);

  if (!updatedUser) {
    throw new NotFoundError('User not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(updatedUser));
}
```

### controllers/users/post.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../createServer";
import { createUser } from "../../models/users";
import { CreateUserSchema } from "../../schemas/users";

export const schema = z.object({
  params: z.object({}),
  body: CreateUserSchema,
});

export async function handler({ context, body, response }: Handler<typeof schema>) {
  const user = await createUser(context, body);

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(201);
  response.end(JSON.stringify(user));
}
```

### controllers/posts/get.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../createServer";
import { listPosts } from "../../models/posts";

export const schema = z.object({
  params: z.object({}),
  query: z
    .object({
      published: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
});

export async function handler({ context, response, query }: Handler<typeof schema>) {
  const normalizedQuery = {
    limit: query?.limit ?? 50,
    offset: query?.offset ?? 0,
    published: query?.published,
  };

  const posts = await listPosts(context, normalizedQuery);

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(posts));
}
```

### controllers/posts/[postId]/get.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../../createServer";
import { NotFoundError } from "../../../errors";
import { findPostById } from "../../../models/posts";

export const schema = z.object({
  params: z.object({
    postId: z.string().uuid(),
  }),
});

export async function handler({ context, params, response }: Handler<typeof schema>) {
  const post = await findPostById(context, params.postId);

  if (!post) {
    throw new NotFoundError('Post not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(post));
}
```

### controllers/posts/[postId]/put.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../../createServer";
import { updatePost } from "../../../models/posts";
import { NotFoundError } from "../../../errors";
import { UpdatePostSchema } from "../../../schemas/posts";

export const schema = z.object({
  params: z.object({
    postId: z.string().uuid({ message: 'Invalid post ID format' }),
  }),
  body: UpdatePostSchema,
});

export async function handler({ context, params, body, response }: Handler<typeof schema>) {
  const updatedPost = await updatePost(context, params.postId, body);

  if (!updatedPost) {
    throw new NotFoundError('Post not found');
  }

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(200);
  response.end(JSON.stringify(updatedPost));
}
```

### controllers/posts/post.ts
```typescript
import { z } from "zod";
import type { Handler } from "../../createServer";
import { createPost } from "../../models/posts";
import { CreatePostSchema } from "../../schemas/posts";

export const schema = z.object({
  params: z.object({}),
  body: CreatePostSchema,
});

export async function handler({ context, body, response }: Handler<typeof schema>) {
  const post = await createPost(context, body);

  response.setHeader('Content-Type', 'application/json');
  response.writeHead(201);
  response.end(JSON.stringify(post));
}
```

### utils/http.ts
```typescript
import { IncomingMessage } from 'http';
import { z } from 'zod';
import { ValidationError } from '../errors';

type BodySchemaSpec = {
  body: {
    contentType: string;
    schema: z.ZodTypeAny;
  };
};

export function readBody(request: IncomingMessage, maxBytes: number) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        request.destroy();
        reject(new ValidationError(`Request body too large (max ${maxBytes} bytes)`));
        return;
      }
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

export function parseJsonSafely(jsonString: string): unknown {
  try {
    return JSON.parse(jsonString);
  } catch {
    throw new ValidationError('Invalid JSON');
  }
}

export async function getBodyFromRequest<
  TSchema extends BodySchemaSpec
>(request: IncomingMessage, schema: TSchema) {
  if (!request.headers['content-type']?.includes(schema.body.contentType)) {
    throw new ValidationError(`Unsupported content type. Expected ${schema.body.contentType}`);
  }

  const rawBody = await readBody(request, 1_048_576);
  if (rawBody.length === 0) {
    throw new ValidationError('Request body is required');
  }

  const parsedBody = parseJsonSafely(rawBody);
  return schema.body.schema.parse(parsedBody);
}
```

### Using URLPattern
```typescript
const pattern = new URLPattern({ pathname: '/users/:userId' });
const match = pattern.exec({ pathname });

if (match) {
  const { userId } = match.pathname.groups;
  // Use userId with full TypeScript support
}
```

### models/posts.ts
```typescript
import { eq, desc, and } from 'drizzle-orm';
import { Context } from '../types';
import { posts } from '../db/schema';
import { Post, PostWithUser, CreatePost, ListPostsQuery } from '../schemas/posts';
import { toApiUser } from '../schemas/users';

export async function listPosts(
  context: Context,
  query: ListPostsQuery
) {
  const conditions = [];

  if (query.published !== undefined) {
    conditions.push(eq(posts.published, query.published));
  }

  const results = await context.db
    .select()
    .from(posts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return results.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    userId: row.userId,
    published: row.published,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function listPostsWithUsers(
  context: Context,
  query: ListPostsQuery
) {
  const conditions = [];

  if (query.published !== undefined) {
    conditions.push(eq(posts.published, query.published));
  }

  const results = await context.db.query.posts.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      user: true,
    },
    orderBy: desc(posts.createdAt),
    limit: query.limit,
    offset: query.offset,
  });

  return results.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    userId: row.userId,
    published: row.published,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: toApiUser(row.user),
  }));
}

export async function createPost(
  context: Context,
  data: CreatePost
) {
  const [result] = await context.db
    .insert(posts)
    .values(data)
    .returning();

  return {
    id: result.id,
    title: result.title,
    content: result.content,
    userId: result.userId,
    published: result.published,
    viewCount: result.viewCount,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export async function findPostById(
  context: Context,
  postId: string
) {
  const result = await context.db.query.posts.findFirst({
    where: eq(posts.id, postId),
  });

  if (!result) return null;

  return {
    id: result.id,
    title: result.title,
    content: result.content,
    userId: result.userId,
    published: result.published,
    viewCount: result.viewCount,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export async function updatePost(
  context: Context,
  postId: string,
  data: { title?: string; content?: string; published?: boolean }
) {
  const [result] = await context.db
    .update(posts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId))
    .returning();

  if (!result) return null;

  return {
    id: result.id,
    title: result.title,
    content: result.content,
    userId: result.userId,
    published: result.published,
    viewCount: result.viewCount,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}
```

## Testing

### Test Database Setup

Before running tests, you need to set up a test database. This ensures tests run against real database operations rather than mocks:

```bash
# Create test database
createdb myapp_test

# Set required test environment variables
export TEST_PORT="0"
export TEST_DATABASE_URL="postgresql://localhost/myapp_test"
export TEST_JWT_SECRET="test-secret"
export TEST_PUBLIC_BASE_URL="http://localhost"
export TEST_MAX_BODY_BYTES="1048576"

# Run migrations on test database
DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate
```

### packages/api/tests/helpers/createTestServer.ts
```typescript
import { createServer } from '../../src/createServer';
import { createContext } from '../../src/createContext';
import { Context } from '../../src/types';
import http from 'node:http';
import * as schema from '../../src/db/schema';

export function createTestContext() {
  const config = {
    port: Number(process.env.TEST_PORT!),
    databaseUrl: process.env.TEST_DATABASE_URL!,
    jwtSecret: process.env.TEST_JWT_SECRET!,
    publicBaseUrl: process.env.TEST_PUBLIC_BASE_URL!,
    maxBodyBytes: Number(process.env.TEST_MAX_BODY_BYTES!),
  };

  return createContext(config);
}

export function createTestServer(context: Context) {
  return createServer(context);
}

export async function cleanupDatabase(context: Context) {
  await context.db.delete(schema.posts);
  await context.db.delete(schema.users);
}
```

### packages/api/tests/controllers/users/[userId]/get.test.ts
```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createTestServer, createTestContext, cleanupDatabase } from '../../helpers/createTestServer';
import { Context } from '../../../src/types';
import { createUser } from '../../../src/models/users';

describe('GET /users/:userId', () => {
  let context: Context;
  let server: http.Server;

  beforeEach(async () => {
    context = createTestContext();
    server = createTestServer(context);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    await cleanupDatabase(context);
  });

  afterEach(async () => {
    await cleanupDatabase(context);
    await context.destroy();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should return user when found', async () => {
    const user = await createUser(context, {
      email: 'test@example.com',
      name: 'Test User',
    });

    const port = (server.address() as any).port;
    const response = await fetch(`http://localhost:${port}/users/${user.id}`);
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.id, user.id);
    assert.strictEqual(body.email, 'test@example.com');
    assert.strictEqual(body.name, 'Test User');
    assert.ok(body.createdAt);
  });

  it('should return 404 when user not found', async () => {
    const port = (server.address() as any).port;
    const response = await fetch(`http://localhost:${port}/users/550e8400-e29b-41d4-a716-446655440000`);
    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.deepStrictEqual(body, {
      error: 'User not found',
      code: 'NOT_FOUND',
    });
  });

  it('should return 400 for invalid UUID', async () => {
    const port = (server.address() as any).port;
    const response = await fetch(`http://localhost:${port}/users/invalid-uuid`);
    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.error, 'Invalid user ID format');
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
  });
});
```

### packages/api/tests/models/users.test.ts
```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { findUserById, createUser } from '../../src/models/users';
import { createTestContext, cleanupDatabase } from '../helpers/createTestServer';
import { Context } from '../../src/types';

describe('User Model', () => {
  let context: Context;

  beforeEach(async () => {
    context = createTestContext();
    await cleanupDatabase(context);
  });

  afterEach(async () => {
    await cleanupDatabase(context);
    await context.destroy();
  });

  describe('findUserById', () => {
    it('should return user when found', async () => {
      const createdUser = await createUser(context, {
        email: 'test@example.com',
        name: 'Test User',
      });

      const foundUser = await findUserById(context, createdUser.id);

      assert.ok(foundUser);
      assert.strictEqual(foundUser.id, createdUser.id);
      assert.strictEqual(foundUser.email, 'test@example.com');
      assert.strictEqual(foundUser.name, 'Test User');
      assert.ok(foundUser.createdAt);
    });

    it('should return null when user not found', async () => {
      const user = await findUserById(context, '550e8400-e29b-41d4-a716-446655440000');

      assert.strictEqual(user, null);
    });
  });

  describe('createUser', () => {
    it('should create and return a new user', async () => {
      const userData = {
        email: 'new@example.com',
        name: 'New User',
      };

      const user = await createUser(context, userData);

      assert.ok(user.id);
      assert.strictEqual(user.email, userData.email);
      assert.strictEqual(user.name, userData.name);
      assert.ok(user.createdAt);
    });
  });
});
```

## Best Practices

### 1. Pure Functions
Keep functions pure when possible. Side effects should be explicit and isolated.

```typescript
// Good: Pure function
export function calculateDiscount(price: number, percentage: number) {
  return price * (1 - percentage / 100);
}

// Good: Side effect is explicit via context
export async function saveOrder(context: Context, order: Order) {
  await context.db.query('INSERT INTO orders...', [order.id]);
}
```

### 2. Utility Functions
Abstract small, reusable functions into utils. Keep them pure and focused on doing one thing well.

**Principles for Utils:**
- **Pure when possible**: No side effects, same input produces same output
- **Single responsibility**: Each function does one thing only
- **Descriptive names**: Function name clearly describes what it does
- **Easy to test**: Pure functions are trivial to unit test

```typescript
// Good: Small, pure, reusable utility
export function parseJsonSafely(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    throw new ValidationError('Invalid JSON');
  }
}

// Good: Single responsibility
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

// Usage in controllers becomes cleaner
const rawData = parseJsonSafely(body); // vs inline try/catch
const price = formatCurrency(order.amount); // vs inline formatting
```

**What to put in utils:**
- JSON parsing with error handling
- Date formatting and manipulation
- String transformations
- Mathematical calculations
- Validation helpers
- Type guards

**What NOT to put in utils:**
- Functions that require context (database operations)
- Business logic (that belongs in services/models)
- Functions that are only used once
- Complex multi-step operations

### 2a. Service Patterns & Libraries
Use the simplest reliable building block for cross-cutting concerns (events, caching, rate limiting).

- Built-ins first: prefer Node primitives (`events`, timers, `Map`, `Set`).
- Small, pure libraries: when needed, choose single-responsibility libraries with no framework tie-ins and minimal side effects (easy to replace).
- Build vs buy:
  - Build tiny helpers (e.g., `removeDuplicates`) in `utils/`.
  - Do not reimplement complex, well-solved components without a clear reason (e.g., event emitters).
  - Rate limiting: in-memory, per-process limiters are fine for simple cases; for production or multi-instance needs, use a focused library or a store-backed approach (e.g., Redis).
- Events: prefer Node’s `events` module for simple pub/sub; consider `emittery` for a small, promise-friendly API. Avoid inventing custom emitters unless requirements are minimal.

### 2b. Packaging Guidelines (Monorepo)
Decide where code lives based on scope and responsibility.

- Keep small, pure utilities in `utils/` within the app/package that uses them.
- Promote larger “service patterns” (cache, rate limiter, event bus) to their own workspace package under `packages/<name>` when they grow beyond trivial use. This keeps boundaries clean and enables extraction.
- Avoid catch-all umbrella packages (e.g., `@CompanyLtdUtilLibrary`). Create narrowly scoped packages with clear, focused APIs.

### 3. Error Handling
Use `AppError` classes for application-specific errors that bubble up to the HTTP layer. Controllers translate those errors into HTTP responses so we only throw and let them bubble.

```typescript
export async function authenticateUser(
  context: Context,
  email: string,
  password: string
) {
  const user = await findUserByEmail(context, email);
  if (!user) {
    throw new ValidationError('Invalid credentials');
  }

  const valid = await verifyPassword(context, password, user.passwordHash);
  if (!valid) {
    throw new ValidationError('Invalid credentials');
  }

  return user;
}
```

### 4. Composition
Build complex operations from simple functions.

```typescript
export async function registerUser(
  context: Context,
  data: { email: string; password: string; name: string }
) {
  // Compose smaller functions
  const existingUser = await findUserByEmail(context, data.email);
  if (existingUser) {
    throw new ConflictError('Email already exists');
  }

  const passwordHash = await hashPassword(context, data.password);
  const user = await createUser(context, {
    email: data.email,
    name: data.name,
    passwordHash,
  });

  await sendWelcomeEmail(context, user);

  return user;
}
```

### 5. External Service Integration
Use the context pattern to inject external services, making them easy to mock in tests.

```typescript
// services/email.ts
export async function sendWelcomeEmail(context: Context, user: User) {
  if (!context.services.emailProvider) {
    throw new Error('Email provider not configured');
  }

  await context.services.emailProvider.send({
    to: user.email,
    subject: 'Welcome to our app!',
    html: `<h1>Welcome ${user.name}!</h1>`,
  });
}

// services/payment.ts
export async function processPayment(
  context: Context,
  amount: number,
  paymentToken: string
) {
  if (!context.services.paymentProvider) {
    throw new Error('Payment provider not configured');
  }

  const charge = await context.services.paymentProvider.createCharge(amount, paymentToken);

  if (charge.status !== 'succeeded') {
    throw new Error('Payment failed');
  }

  return charge;
}
```

### 6. Testing Strategy

The Node Test Runner `node:test` is now included in the latest stable version of node. Therefore we don't need to use any testing framework.

Do not install a testing framework. The built in node test is good enough.

#### What to Mock vs What Not to Mock

**DO NOT MOCK (use real implementations):**
- Database operations (PostgreSQL)
- File system operations
- Internal application services
- HTTP requests within your application
- Any infrastructure your application owns

**DO MOCK (external third-party services):**
- Email providers (SendGrid, Mailgun, etc.)
- Payment processors (Stripe, PayPal, etc.)
- SMS services (Twilio, etc.)
- External APIs (weather, geocoding, etc.)

#### Using Node.js Built-in Test Runner
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
tsx --test src/models/users.test.ts
```

#### Readiness In Tests
- Do not add arbitrary sleeps. Rely on server lifecycle guarantees: start/stop/restart resolve only when ready.
- If a restart is triggered asynchronously from within a request handler, probe the health endpoint until ready instead of sleeping.
- Prefer the dot reporter when running tests that start HTTP servers to avoid TTY stalls.

#### Test Structure
- Use `describe`, `it`, `beforeEach`, `afterEach` from `node:test`
- Use `assert` from `node:assert` for assertions
- Keep tests close to the code they test

#### Example Test Pattern for External Services
```typescript
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createTestContext, cleanupDatabase } from '../helpers/createTestServer';

describe('Email Service Integration', () => {
  let context: Context;
  let mockSendEmail: any;

  beforeEach(async () => {
    context = createTestContext();
    await cleanupDatabase(context);

    // Mock external email service (like Twilio SendGrid)
    mockSendEmail = mock.fn();
    context.services.emailProvider = {
      send: mockSendEmail,
    };
  });

  afterEach(async () => {
    await cleanupDatabase(context);
    await context.destroy();
  });

  it('should send welcome email when user registers', async () => {
    mockSendEmail.mock.mockImplementation(() => Promise.resolve({ messageId: '123' }));

    const user = await registerUser(context, {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });

    assert.ok(user);
    assert.strictEqual(mockSendEmail.mock.calls.length, 1);
    assert.strictEqual(mockSendEmail.mock.calls[0].arguments[0].to, 'test@example.com');
  });
});
```

#### Testing Best Practices
- Unit test pure functions without context
- Integration test functions that use context with real database
- Only mock external third-party services (like Twilio, Stripe, etc.)
- Use real database for all internal operations
- Clean up database state between tests
- Test error cases explicitly
- Use minimal test setup
- Avoid testing implementation details

## Dependencies

### Core Principles

**Resist dependencies.** Less is more. Every dependency is a liability, more attack surface, more breaking changes, more complexity.

**Don't be over the top.** Don't rewrite React, Zod, or database drivers. Use mature, battle-tested libraries for complex problems.

**You probably don't need lodash.** Modern JavaScript has most of what you need built-in.

### Avoid Deep Coupling To A Single HTTP Stack

The risk is not "Express is bad"; the risk is deep coupling to framework-specific middleware and mutable request state.

```
app + framework-specific middleware + custom plugin assumptions + framework adapters
```

When you couple business logic to framework internals, upgrades become expensive regardless of framework.

**Better approach:** Keep routing/HTTP concerns at the edge, keep domain logic framework-agnostic, and use focused libraries (`jose`, `zod`, DB driver/ORM) behind explicit functions.

### Middleware is an Anti-Pattern

Middleware encourages mutation of objects you don't control. Why does `request.body` magically appear?

```javascript
// Bad: Mysterious mutation
app.use(bodyParser.json())
app.post('/api', (request, response) => {
  // Where did request.body come from?
  console.log(request.body)
})

// Good: Explicit and testable
app.post('/api', (request, response) => {
  const body = parseJsonBody(request)
  console.log(body)
})
```

Explicit is better than implicit. Functions are better than magic.

## Database Configuration

### packages/api/drizzle.config.ts
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### packages/api/src/db/migrate.ts
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
  });

  const db = drizzle(pool, { schema });

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete');

  await pool.end();
}

runMigrations().catch(console.error);
```

## TypeScript Compilation Strategy

### Applications vs Libraries

**For Node.js Applications:**
- Don't compile TypeScript to JavaScript
- Use Node's built-in type stripping to run TypeScript files directly: `node src/main.ts`
- Faster development cycle, no build step needed
- Simpler deployment (just copy source files)
- Caveat: all local ESM imports must include the full `.ts` filename (including dynamic imports)
- DO NOT import with `.js` extension UNLESS the actual source file is `.js` and not `.ts`.

**For Libraries:**
- Always compile to JavaScript before publishing
- Avoids TypeScript version conflicts with consuming applications
- Provides better compatibility across different Node.js environments
- Include declaration files for TypeScript consumers

### Running Applications

```bash
# Development
node --watch src/main.ts

# Production (still no compilation needed)
node src/main.ts

# With environment variables
DATABASE_URL=postgresql://localhost/myapp node src/main.ts
```

```typescript
import { findTodoById } from "../../../models/todos.ts";
import { TodoIdParamSchema, TodoSchema } from "../../../schemas/todos.ts";
import type { Controller } from "../../../types.ts";
import { sendJsonValidated } from "../../../utils/http.ts";
```

### Root package.json (Workspace Configuration)
```json
{
  "name": "project-root",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=@project/api",
    "dev:ui": "npm run dev --workspace=@project/ui",
    "dev:admin": "npm run dev --workspace=@project/admin-ui",
    "dev:all": "npm run dev --workspace=@project/api & npm run dev --workspace=@project/ui & npm run dev --workspace=@project/admin-ui",
    "build:ui": "npm run build --workspace=@project/ui",
    "build:admin": "npm run build --workspace=@project/admin-ui",
    "test": "npm run test --workspaces",
    "install": "npm install --workspaces"
  }
}
```

### packages/api/package.json
```json
{
  "name": "@project/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "node --watch src/main.ts",
    "start": "node src/main.ts",
    "test": "node --test tests",
    "db:migrate": "node src/db/migrate.ts",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.29.0",
    "pg": "^8.11.0",
    "zod": "^4.0.0"
  }
}
```

### packages/ui/package.json
```json
{
  "name": "@project/ui",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

### packages/admin-ui/package.json
```json
{
  "name": "@project/admin-ui",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

### Libraries package.json (if building libraries)
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --test src",
    "prepublishOnly": "npm run build"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

## OpenAPI Documentation

### Controller Schema Exports

Each controller should export a `schema` object that mirrors the OpenAPI path definition while reusing the same Zod validators used for runtime validation:

```typescript
import { z } from 'zod';
import { ControllerDefinition, ControllerSchema, Handler } from '../../types';
import { UserSchema } from '../../schemas/users';

export const schema = {
  method: 'GET',
  path: '/users/{userId}',
  tags: ['Users'] as const,
  summary: 'Get user by ID',
  params: z.object({
    userId: z.string().uuid({ message: 'Invalid user ID format' })
  }),
  responses: {
    200: {
      description: 'User found',
      content: {
        'application/json': {
          schema: UserSchema
        }
      }
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            code: z.string()
          })
        }
      }
    }
  }
} as const satisfies ControllerSchema;

type Schema = typeof schema;

export const handler: Handler<Schema> = async ({ context, response, params }) => {
  // ...handler logic
};

export const controller: ControllerDefinition<Schema> = {
  schema,
  handler,
};
```

### OpenAPI Endpoint

Create an `/openapi` endpoint that collects all controller schemas:

```typescript
// In createServer.ts
import { z, toJSONSchema } from 'zod';
import { controller as listUsersController } from './controllers/users/get';
import { controller as createUserController } from './controllers/users/post';
import { controller as getUserController } from './controllers/users/[userId]/get';

const documentedControllers = [
  listUsersController,
  createUserController,
  getUserController,
];

function zodObjectToParameters(
  object: z.ZodObject<Record<string, z.ZodTypeAny>>,
  location: 'path' | 'query',
) {
  const shape = object.shape;
  return Object.entries(shape).map(([name, definition]) => ({
    name,
    in: location,
    required: location === 'path' || !definition.isOptional?.(),
    schema: toJSONSchema(definition),
  }));
}

function generateOpenApiDocument(config: Config) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const { schema } of documentedControllers) {
    const method = schema.method.toLowerCase();
    const pathItem = paths[schema.path] ?? (paths[schema.path] = {});

    const parameters = [
      ...(schema.params ? zodObjectToParameters(schema.params, 'path') : []),
      ...(schema.query ? zodObjectToParameters(schema.query, 'query') : []),
    ];

    const responses = Object.fromEntries(
      Object.entries(schema.responses).map(([status, response]) => [
        status,
        {
          description: response.description,
          ...(response.content
            ? {
                content: {
                  'application/json': {
                    schema: toJSONSchema(response.content['application/json'].schema),
                  },
                },
              }
            : {}),
        },
      ]),
    );

    const requestBody = schema.body
      ? {
          description: schema.body.description,
          required: schema.body.required ?? true,
          content: {
            [schema.body.contentType]: {
              schema: toJSONSchema(schema.body.schema),
            },
          },
        }
      : undefined;

    pathItem[method] = {
      summary: schema.summary,
      description: schema.description,
      tags: schema.tags,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'API Documentation',
      description: 'Generated API documentation',
    },
    servers: [{ url: `http://${config.host}:${config.port}` }],
    paths,
  };
}

const openApiRoute: Route = {
  method: 'GET',
  pattern: new URLPattern({ pathname: '/openapi' }),
  controller: Promise.resolve({
    schema: {
      method: 'GET',
      path: '/openapi',
      params: z.object({}),
      responses: {
        200: {
          description: 'OpenAPI document',
          content: {
            'application/json': {
              schema: z.object({}).passthrough(),
            },
          },
        },
      },
    },
    handler: async ({ context, response }) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(generateOpenApiDocument(context.config)));
    },
  }),
};

const routes: Route[] = [
  // ...other routes
  openApiRoute,
];
```

### Best Practices

- Keep controller `schema` metadata in sync with the HTTP handler implementation
- Use descriptive tags and summaries
- Include example values for better documentation
- Document all response codes including error cases
- Keep schemas consistent with your Zod validation schemas

## Summary

This approach provides:
- **Testability**: Easy to mock external dependencies via context
- **Simplicity**: No frameworks, minimal dependencies
- **Explicitness**: All dependencies are visible
- **Flexibility**: Easy to add new features or change implementations
- **Type Safety**: Full TypeScript support with Zod runtime validation
- **Functional**: Encourages pure functions and composition
- **Database Safety**: Type-safe queries with Drizzle ORM
- **API Validation**: Input/output validation with Zod schemas
- **Error Handling**: Centralized error handling with AppError classes
- **API Documentation**: Auto-generated OpenAPI specs from controller schemas

The context pattern combined with single function exports creates a clean, maintainable codebase that's easy to understand and test.

## Key Principles

1. **Separation of Concerns**:
   - Database schemas (Drizzle) define database structure
   - API schemas (Zod) define external contracts
   - Models handle data access
   - Controllers handle HTTP logic and validation

2. **Type Safety Layers**:
   - Internal types (Context, Config) use plain TypeScript
   - External types (API responses) use Zod for runtime validation
   - Database queries are fully typed with Drizzle
   - Return types omitted where TypeScript can infer them

3. **Error Handling**:
   - AppError classes for application-specific errors
   - Errors bubble up to HTTP layer for centralized handling
   - Validation errors include detailed information
   - Database constraint violations handled appropriately

4. **No Abbreviations**:
   - Use full names: `request` instead of `req`, `response` instead of `res`
   - Improves code readability and maintainability
