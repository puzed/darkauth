import type { PGlite } from "@electric-sql/pglite";
import type http from "node:http";

export type Logger = {
  info: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
};

export type Config = {
  port: number;
  issuer: string;
};

export type Context = {
  db: PGlite;
  config: Config;
  logger: Logger;
};

export type Route = {
  method: string;
  pattern: URLPattern;
  handler: (
    context: Context,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    match: URLPatternResult
  ) => Promise<void> | void;
  operation?: {
    summary?: string;
    tags?: string[];
    requestBody?: { contentType: string; schema: unknown };
    responses?: Record<string, { description?: string; content?: { [contentType: string]: { schema?: unknown } } }>;
  };
};
