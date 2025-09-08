# Functional Node.js Project Guide

## Overview

This guide describes how to build a functional, minimal dependency Node.js project using the context pattern. The context pattern provides dependency injection without frameworks, making testing easy and keeping the codebase simple.

## Project Structure

```
project/
├── src/
│   ├── main.ts
│   ├── createServer.ts
│   ├── createContext.ts
│   ├── types.ts
│   ├── errors.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── migrate.ts
│   ├── schemas/
│   │   ├── users.ts
│   │   └── posts.ts
│   ├── utils/
│   │   └── http.ts
│   ├── models/
│   │   ├── users.ts
│   │   └── posts.ts
│   ├── services/
│   │   ├── auth.ts
│   │   └── email.ts
│   └── controllers/
│       ├── users/
│       │   ├── get.ts
│       │   └── create.ts
│       └── posts/
│           ├── list.ts
│           └── create.ts
├── ui/                     
│   ├── src/                
│   ├── index.html          
│   └── vite.config.ts      
├── admin-ui/               
│   ├── src/                
│   ├── index.html          
│   └── vite.config.ts      
├── tests/
│   ├── helpers/
│   │   └── createTestServer.ts
│   ├── models/
│   │   └── users.test.ts
│   └── controllers/
│       └── users/
│          ├── get.test.ts
│          └── create.test.ts
├── drizzle/
│   └── migrations/
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## Core Concepts

- Use the context pattern instead of complex dependency injection frameworks.
- Comments should be rarely be needed as code should be written to be self-documenting.
- Comments should be used to explain why a unintuitive code block or hack is needed, not what it does.
- Never abbreviate anything, variables, functions, etc.
- Prefer built in Node functionality over third party libraries.
- Only mock external systems, not the internal ones this project needs. For example, don't mock our postgres database, use a real one in the tests. But it would be okay to mock the Twilio API, it's a third party.
 - Auth UI and Admin UI are built with React + TypeScript + CSS Modules and compiled to static assets served by the Node HTTP server. Do not introduce server-side rendering frameworks.

### 1. Context Pattern

The context object contains all dependencies (database, services, config) and is passed to every function. This enables:
- Easy testing by mocking dependencies
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

### Install Flow
- First run exposes a temporary Install UI on `http://localhost:9081/install?token=<random>` guarded by a single-use, short-lived token.
- The install form collects `adminEmail`, `adminName`, and secure-mode selection. If secure mode is chosen and no `ZKAUTH_KEK_PASSPHRASE` is supplied, the form accepts a passphrase to derive KEK (Argon2id) for encrypting private keys and secrets.
- Submitting the form runs migrations, seeds defaults and clients, creates the initial admin with role `write` (no password), and marks the system initialized. The Install UI shuts down.
- On first Admin UI visit after install, the bootstrap admin completes OPAQUE registration to set the password.


### types.ts
```typescript
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './db/schema';

export interface Context {
  db: NodePgDatabase<typeof schema>;
  config: Config;
  services: Services;
}

export interface Services {
  emailProvider?: {
    send: (options: { to: string; subject: string; html: string }) => Promise<{ messageId: string }>;
  };
  paymentProvider?: {
    createCharge: (amount: number, token: string) => Promise<{ id: string; status: string }>;
  };
}

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
}

### Ports
- User/OIDC/UI: `9080`
- Admin UI/API + Install UI: `9081`
```

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
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
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
    cleanupFunctions,
    async destroy() {
      for (const cleanup of this.cleanupFunctions) {
        await cleanup();
      }
    },
  };
}
```

### createServer.ts
```typescript
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { Context } from './types';
import { AppError } from './errors';
import { getUser } from './controllers/users/get';
import { createUser } from './controllers/users/create';
import { listPosts } from './controllers/posts/list';
import { createPost } from './controllers/posts/create';

export function createServer(context: Context) {
  return createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const method = request.method || 'GET';

      // User routes
      const userMatch = url.pathname.match(/^\/users\/([^\/]+)$/);
      if (method === 'GET' && userMatch) {
        return await getUser(context, request, response, userMatch[1]);
      }

      if (method === 'POST' && url.pathname === '/users') {
        return await createUser(context, request, response);
      }

      // Post routes
      if (method === 'GET' && url.pathname === '/posts') {
        return await listPosts(context, request, response);
      }

      if (method === 'POST' && url.pathname === '/posts') {
        return await createPost(context, request, response);
      }

      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      if (error instanceof AppError) {
        response.statusCode = error.statusCode;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
          error: error.message,
          code: error.code,
          ...(error instanceof ValidationError && error.details ? { details: error.details } : {})
        }));
        return;
      }

      if (error instanceof ZodError) {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: error.message, details: error.errors }));
        return;
      }

      console.error('Unexpected error:', error);
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}
```

### main.ts
```typescript
import { createContext } from './createContext';
import { createServer } from './createServer';

async function main() {
  const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/myapp',
    jwtSecret: process.env.JWT_SECRET || 'development-secret',
  };

  const context = createContext(config);
  const server = createServer(context);

  server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

main().catch(console.error);
```

### models/users.ts
```typescript
import { eq } from 'drizzle-orm';
import { Context } from '../types';
import { NotFoundError, ConflictError } from '../errors';
import { users } from '../db/schema';
import { User, CreateUser, toApiUser } from '../schemas/users';

export async function findUserById(context: Context, userId: string) {
  const result = await context.db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  return result ? toApiUser(result) : null;
}

export async function findUserByEmail(context: Context, email: string) {
  const result = await context.db.query.users.findFirst({
    where: eq(users.email, email),
  });

  return result ? toApiUser(result) : null;
}

export async function createUser(context: Context, data: CreateUser) {
  const validUser = CreateUserSchema.parse(data);

  const [result] = await context.db
    .insert(users)
    .values(validUser)
    .returning();

  return toApiUser(result);
}

export async function updateUser(
  context: Context,
  userId: string,
  data: { name?: string; email?: string }
) {
  const validUser = UpdateUserSchema.parse(data);

  const [result] = await context.db
    .update(validUser)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result ? toApiUser(result) : null;
}

export async function deleteUser(context: Context, userId: string) {
  const result = await context.db
    .delete(users)
    .where(eq(users.id, userId));

  return result.rowCount > 0;
}
```

### controllers/users/get.ts
```typescript
import { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { Context } from '../../types';
import { ValidationError, NotFoundError } from '../../errors';
import { findUserById } from '../../models/users';

const ParamsSchema = z.object({
  userId: z.string().uuid(),
});

export async function getUser(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userId: string
) {
  // Validate params
  const parseResult = ParamsSchema.safeParse({ userId });
  if (!parseResult.success) {
    throw new ValidationError('Invalid user ID format', parseResult.error.errors);
  }

  const user = await findUserById(context, parseResult.data.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(user));
}
```

### controllers/users/create.ts
```typescript
import { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { Context } from '../../types';
import { ValidationError } from '../../errors';
import { createUser } from '../../models/users';
import { CreateUserSchema } from '../../schemas/users';
import { readBody } from '../../utils/http';

export async function createUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readBody(request);

  let rawData;
  try {
    rawData = JSON.parse(body);
  } catch {
    throw new ValidationError('Invalid JSON');
  }

  // Validate input
  const parseResult = CreateUserSchema.safeParse(rawData);
  if (!parseResult.success) {
    throw new ValidationError('Validation error', parseResult.error.errors);
  }

  // Create user
  const user = await createUser(context, parseResult.data);

  response.statusCode = 201;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(user));
}
```

### controllers/posts/list.ts
```typescript
import { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { Context } from '../../types';
import { ValidationError } from '../../errors';
import { listPosts} from '../../models/posts';
import { ListPostsQuerySchema } from '../../schemas/posts';

export async function listPostsController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  // Parse and validate query parameters
  const parseResult = ListPostsQuerySchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
    published: url.searchParams.get('published'),
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', parseResult.error.errors);
  }

  const posts = await listPosts(context, parseResult.data);

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(posts));
}
```

### controllers/posts/create.ts
```typescript
import { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { Context } from '../../types';
import { ValidationError } from '../../errors';
import { createPost } from '../../models/posts';
import { CreatePostSchema } from '../../schemas/posts';
import { readBody } from '../../utils/http';

export async function createPostController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readBody(request);

  let rawData;
  try {
    rawData = JSON.parse(body);
  } catch {
    throw new ValidationError('Invalid JSON');
  }

  // Validate input
  const parseResult = CreatePostSchema.safeParse(rawData);
  if (!parseResult.success) {
    throw new ValidationError('Validation error', parseResult.error.errors);
  }

  // Create post
  const post = await createPost(context, parseResult.data);

  response.statusCode = 201;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(post));
}
```

### utils/http.ts
```typescript
import { IncomingMessage } from 'http';
import { ValidationError } from '../errors';

export function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

export function parseJsonSafely(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    throw new ValidationError('Invalid JSON');
  }
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

# Set environment variable
export TEST_DATABASE_URL="postgresql://localhost/myapp_test"

# Run migrations on test database
DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate
```

### tests/helpers/createTestServer.ts
```typescript
import { createServer } from '../../src/createServer';
import { createContext } from '../../src/createContext';
import { Context } from '../../src/types';
import http from 'node:http';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';

export function createTestContext() {
  const config = {
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://localhost/myapp_test',
    jwtSecret: 'test-secret',
  };

  return createContext(config);
}

export function createTestServer(context: Context) {
  return createServer(context);
}

export async function request(
  server: http.Server,
  options: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
  }
) {
  const port = (server.address() as any).port;
  const response = await fetch(`http://localhost:${port}${options.path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body
  };
}

export async function cleanupDatabase(context: Context) {
  await context.db.delete(schema.posts);
  await context.db.delete(schema.users);
}
```

### tests/controllers/users/get.test.ts
```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createTestServer, createTestContext, request, cleanupDatabase } from '../../helpers/createTestServer';
import { Context } from '../../../src/types';
import { createUser } from '../../../src/models/users';

describe('GET /users/:id', () => {
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

    const response = await request(server, {
      method: 'GET',
      path: `/users/${user.id}`,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.id, user.id);
    assert.strictEqual(response.body.email, 'test@example.com');
    assert.strictEqual(response.body.name, 'Test User');
    assert.ok(response.body.createdAt);
  });

  it('should return 404 when user not found', async () => {
    const response = await request(server, {
      method: 'GET',
      path: '/users/550e8400-e29b-41d4-a716-446655440000',
    });

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(response.body, {
      error: 'User not found',
      code: 'NOT_FOUND',
    });
  });

  it('should return 400 for invalid UUID', async () => {
    const response = await request(server, {
      method: 'GET',
      path: '/users/invalid-uuid',
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, 'Invalid user ID format');
    assert.strictEqual(response.body.code, 'VALIDATION_ERROR');
  });
});
```

### tests/models/users.test.ts
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

### 3. Error Handling
Use AppError classes for application-specific errors that bubble up to the HTTP layer.

```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

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
- Cloud storage services (AWS S3, etc.)

#### Using Node.js Built-in Test Runner
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
tsx --test src/models/users.test.ts
```

#### Test Structure
- Use `describe`, `it`, `beforeEach`, `afterEach` from `node:test`
- Use `assert` from `node:assert` for assertions
- Use `mock` from `node:test` for mocking
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

**Resist dependencies.** Less is more. Every dependency is a liability—more attack surface, more breaking changes, more complexity.

**Don't be insane.** Don't rewrite React, Zod, or database drivers. Use mature, battle-tested libraries for complex problems.

**You probably don't need lodash.** Modern JavaScript has most of what you need built-in.

### Avoid Vertical Dependency Stacks

Frameworks like Express create dependency chains that become maintenance nightmares:

```
express → express-body-parser → express-passport → express-session → express-rate-limit
```

When Express updates, every middleware might break. When `express-body-parser` updates, you're stuck coordinating versions across the entire stack.

**Better approach:** Use focused, single-purpose libraries.

Instead of:
- `express-body-parser` → Use a standalone body parser like `@fastify/formbody`
- `express-passport` → Use a dedicated auth library like `jose` for JWT
- `express-session` → Use a session library that works with any framework

### Middleware is an Anti-Pattern

Middleware encourages mutation of objects you don't control. Why does `req.body` magically appear?

```javascript
// Bad: Mysterious mutation
app.use(bodyParser.json())
app.post('/api', (req, res) => {
  // Where did req.body come from?
  console.log(req.body)
})

// Good: Explicit and testable
app.post('/api', (req, res) => {
  const body = parseJsonBody(req)
  console.log(body)
})
```

Explicit is better than implicit. Functions are better than magic.

## Database Configuration

### drizzle.config.ts
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/myapp',
  },
});
```

### db/migrate.ts
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/myapp',
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
- Use `tsx` to run TypeScript files directly: `tsx src/main.ts`
- Faster development cycle, no build step needed
- Simpler deployment (just copy source files)

**For Libraries:**
- Always compile to JavaScript before publishing
- Avoids TypeScript version conflicts with consuming applications
- Provides better compatibility across different Node.js environments
- Include declaration files for TypeScript consumers

### Running Applications

```bash
# Development
tsx --watch src/main.ts

# Production (still no compilation needed)
tsx src/main.ts

# With environment variables
DATABASE_URL=postgresql://localhost/myapp tsx src/main.ts
```

### package.json Scripts for Applications
```json
{
  "scripts": {
    "dev": "tsx src/main.ts",
    "start": "tsx src/main.ts",
    "test": "tsx --test src/**/*.test.ts",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "tsx": "^4.0.0"
  }
}
```

### package.json Scripts for Libraries
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "tsx --test src/**/*.test.ts",
    "prepublishOnly": "npm run build"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Models and Controllers

### Model Responsibilities

Models handle all data access logic and business rules. They should be the single source of truth for how data is retrieved, created, updated, and deleted.

**Models should:**
- Contain all database queries and operations
- Handle data validation and business logic
- Implement data transformation and aggregation
- Manage relationships between entities
- Provide clean, typed interfaces for data access
- Handle pagination, filtering, and search logic
- Throw appropriate errors (NotFoundError, ConflictError, etc.)
- Be pure functions that take `Context` as first parameter

**Models should NOT:**
- Handle HTTP requests/responses
- Manage authentication/authorization
- Deal with OpenAPI specifications
- Parse query parameters or request bodies

### Controller Responsibilities

Controllers are thin layers that handle HTTP-specific concerns and coordinate between different parts of the system.

**Controllers should:**
- Handle HTTP request/response lifecycle
- Parse and validate query parameters and request bodies
- Manage authentication and authorization (via session middleware)
- Call appropriate model functions with validated data
- Handle OpenAPI specification registration
- Transform model responses for HTTP responses
- Catch and transform errors for HTTP responses

**Controllers should NOT:**
- Contain database queries or business logic
- Handle complex data transformations
- Implement pagination or filtering logic
- Manage database transactions directly

### Model-Controller Relationship

The relationship follows this pattern:

```typescript
// Controller (HTTP layer)
export async function getUsers(context: Context, request: IncomingMessage, response: ServerResponse) {
  // 1. Authentication/authorization
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  // 2. Parse and validate input
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const { page, limit } = getPaginationFromUrl(url, 20, 100);
  const search = url.searchParams.get("search");

  // 3. Call model function
  const result = await listUsers(context, { page, limit, search: search || undefined });

  // 4. Return HTTP response
  sendJsonValidated(response, 200, result, UsersListResponseSchema);
}

// Model (Data layer)
export async function listUsers(
  context: Context,
  options: { page?: number; limit?: number; search?: string } = {}
) {
  // All database logic, pagination, filtering, etc.
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  // Complex queries, joins, aggregations
  const users = await context.db
    .select(/* ... */)
    .from(/* ... */)
    .where(/* ... */)
    .limit(limit)
    .offset(offset);

  return {
    users,
    pagination: { /* ... */ }
  };
}
```

### Type Safety Between Layers

Models should export clean TypeScript interfaces that controllers can use:

```typescript
// schemas/users.ts - Define external API types
export const UserSchema = z.object({
  sub: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// models/users.ts - Database operations with types
export async function listUsers(
  context: Context,
  options: ListUsersOptions
): Promise<ListUsersResult> {
  // Database operations
}

// controllers/users.ts - HTTP handling
export async function getUsers(context: Context, request: IncomingMessage, response: ServerResponse) {
  const result = await listUsers(context, options);
  sendJsonValidated(response, 200, result, UsersListResponseSchema);
}
```

### Error Handling

Both models and controllers should use the same error classes, but handle them at different levels:

- **Models**: Throw business logic errors (NotFoundError, ConflictError, ValidationError)
- **Controllers**: Catch and transform errors for HTTP responses (handled automatically by error middleware)

### Testing Strategy

- **Model tests**: Focus on data operations, business logic, edge cases
- **Controller tests**: Focus on HTTP handling, authentication, input validation
- **Integration tests**: Test the full flow from HTTP request to database

## OpenAPI Documentation

### Controller Schema Exports

Each controller should export an OpenAPI schema using `zod-to-openapi`:

```typescript
import { z } from 'zod';
import { createRouteSpec } from '@asteasolutions/zod-to-openapi';
import { UserSchema } from '../../schemas/users';

export const openApiSchema = createRouteSpec({
  method: 'get',
  path: '/users/{userId}',
  tags: ['Users'],
  summary: 'Get user by ID',
  request: {
    params: z.object({
      userId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
  },
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
});
```

### OpenAPI Endpoint

Create an `/openapi` endpoint that collects all controller schemas:

```typescript
// In createServer.ts
import { OpenAPIGenerator } from '@asteasolutions/zod-to-openapi';
import { openApiSchema as getUserSchema } from './controllers/users/get';
import { openApiSchema as createUserSchema } from './controllers/users/create';

function generateOpenApiDocument() {
  const generator = new OpenAPIGenerator([
    getUserSchema,
    createUserSchema,
    // ... other controller schemas
  ]);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'API Documentation',
      description: 'Generated API documentation'
    },
    servers: [{ url: 'http://localhost:3000' }]
  });
}

// In router:
if (method === 'GET' && url.pathname === '/openapi') {
  const openApiDoc = generateOpenApiDocument();
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(openApiDoc, null, 2));
  return;
}
```

### Best Practices

- Export `openApiSchema` from each controller file
- Use descriptive tags and summaries
- Include example values for better documentation
- Document all response codes including error cases
- Keep schemas consistent with your Zod validation schemas

## Summary

This approach provides:
- **Testability**: Easy to mock dependencies via context
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
