import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { JWTPayload as JoseJWTPayload } from "jose";
import type { ZodObject, ZodRawShape, ZodTypeAny } from "zod";
import type * as schema from "./db/schema.js";

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export interface Context {
  db: Database;
  config: Config;
  services: Services;
  logger: Logger;
  cleanupFunctions: Array<() => Promise<void> | void>;
  destroy: () => Promise<void>;
  restart?: () => Promise<void>;
}

export interface Logger {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  trace: (obj: unknown, msg?: string) => void;
  fatal: (obj: unknown, msg?: string) => void;
}

export interface AuditEvent {
  eventType: string;
  method?: string;
  path?: string;
  cohort?: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  requestBody?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  responseTime?: number;
  details?: Record<string, unknown>;
}

export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  eventType?: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export type AuditLog = typeof schema.auditLogs.$inferSelect;

export interface Services {
  kek?: {
    encrypt: (data: Buffer) => Promise<Buffer>;
    decrypt: (data: Buffer) => Promise<Buffer>;
    isAvailable: () => boolean;
  };
  opaque?: {
    serverSetup: () => Promise<OpaqueServerSetup>;
    startRegistration: (
      request: Uint8Array,
      identityU: string,
      identityS?: string
    ) => Promise<OpaqueRegistrationResponse>;
    finishRegistration: (
      record: Uint8Array,
      identityU: string,
      identityS?: string
    ) => Promise<OpaqueRecord>;
    startLogin: (
      request: Uint8Array,
      record: OpaqueRecord,
      identityU: string,
      identityS?: string
    ) => Promise<OpaqueLoginResponse>;
    startLoginWithDummy: (
      request: Uint8Array,
      identityU: string,
      identityS?: string
    ) => Promise<OpaqueLoginResponse>;
    finishLogin: (finish: Uint8Array, sessionId: string) => Promise<OpaqueLoginResult>;
  };
  install?: {
    token?: string;
    createdAt?: number;
    tempDb?: Database;
    tempPool?: import("pg").Pool;
    tempDbClose?: () => Promise<void> | void;
    chosenPostgresUri?: string;
    chosenDbMode?: "remote" | "pglite";
    chosenPgliteDir?: string;
    adminEmail?: string;
    adminCreated?: boolean;
    restartRequested?: boolean;
  };
  audit?: {
    logEvent: (event: AuditEvent) => Promise<void>;
    queryLogs: (filters: AuditFilters) => Promise<AuditLog[]>;
  };
}

export interface Config {
  dbMode?: "remote" | "pglite";
  pgliteDir?: string;
  postgresUri: string;
  userPort: number;
  adminPort: number;
  proxyUi: boolean;
  kekPassphrase: string; // Now required, no longer optional
  isDevelopment: boolean;
  publicOrigin: string;
  issuer: string;
  rpId: string;
  insecureKeys?: boolean; // Allow insecure keys for testing
  logLevel?: string; // Pino log level (error, warn, info, debug, trace, silent)
  inInstallMode?: boolean;
  configFile?: string; // Path to config file (defaults to config.yaml)
  installToken?: string; // Optional fixed install token for tests
}

export interface OpaqueServerSetup {
  serverPublicKey: string;
}

export interface OpaqueRegistrationResponse {
  message: Uint8Array;
  serverPublicKey: Uint8Array;
}

export interface OpaqueRecord {
  envelope: Uint8Array;
  serverPublicKey: Uint8Array;
}

export interface OpaqueLoginResponse {
  message: Uint8Array;
  sessionId: string;
}

export interface OpaqueLoginResult {
  sessionKey: Uint8Array;
}

export interface JWK {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  key_ops?: string[];
  x?: string;
  y?: string;
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  crv?: string;
  k?: string;
}

export interface IdTokenClaims extends JoseJWTPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  acr?: string;
  amr?: string[];
  azp?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  permissions?: string[];
  groups?: string[];
  [key: string]: unknown;
}

export type ControllerSchemaObject = ZodTypeAny | Record<string, unknown>;

export type ControllerResponseContent = Record<
  string,
  {
    schema: ControllerSchemaObject;
  }
>;

export interface ControllerResponse {
  description: string;
  content?: ControllerResponseContent;
}

export interface ControllerBody {
  description?: string;
  contentType: string;
  required?: boolean;
  schema: ControllerSchemaObject;
}

export interface ControllerSchema {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  path: string;
  summary: string;
  description?: string;
  tags?: readonly string[];
  params?: ZodObject<ZodRawShape>;
  query?: ZodObject<ZodRawShape>;
  body?: ControllerBody;
  responses: Record<string, ControllerResponse>;
}

export interface ControllerDefinition<TSchema extends ControllerSchema> {
  schema: TSchema;
  handler: (args: HandlerArgs<TSchema>) => unknown | Promise<unknown>;
}

type InferParams<TSchema extends ControllerSchema> = TSchema["params"] extends ZodTypeAny
  ? TSchema["params"]["_output"]
  : undefined;

type InferQuery<TSchema extends ControllerSchema> = TSchema["query"] extends ZodTypeAny
  ? TSchema["query"]["_output"]
  : undefined;

type InferBody<TSchema extends ControllerSchema> = TSchema["body"] extends { schema: infer Schema }
  ? Schema extends ZodTypeAny
    ? Schema["_output"]
    : Schema extends Record<string, unknown>
      ? Schema
      : undefined
  : undefined;

export interface HandlerArgs<TSchema extends ControllerSchema> {
  context: Context;
  request: IncomingMessage;
  response: ServerResponse;
  params: InferParams<TSchema>;
  query: InferQuery<TSchema>;
  body: InferBody<TSchema>;
}

export interface JWTPayload extends JoseJWTPayload {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
  acr?: string;
  amr?: string[];
  azp?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  permissions?: string[];
  groups?: string[];
  purpose?: string; // For password change tokens and other internal purposes
}

export interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  zk_drk_hash?: string;
}

export interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  zk_pub?: string;
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

export interface SessionData {
  sub?: string;
  email?: string;
  name?: string;
  adminId?: string;
  adminRole?: "read" | "write";
  pendingAuthId?: string;
  otpRequired?: boolean;
  otpVerified?: boolean;
}

export interface InstallRequest {
  adminEmail: string;
  adminName: string;
  token?: string;
  kekPassphrase?: string;
}

export type HttpHandler = (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) => Promise<void>;

export type ControllerFunction = HttpHandler;

export interface Route {
  method: string;
  pattern: RegExp;
  handler: HttpHandler;
}

export interface KdfParams {
  salt: string;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
}
