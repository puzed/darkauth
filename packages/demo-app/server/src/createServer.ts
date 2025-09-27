import http from "node:http";
import type { Context, Route } from "./types";
import { initDemoSchema } from "./models/notes";
import { getRoutes } from "./controllers/routes";

function sendCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = request.headers.origin as string | undefined;
  if (!origin) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader(
    "Access-Control-Allow-Headers",
    request.headers["access-control-request-headers"] || "authorization,content-type"
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    request.headers["access-control-request-method"] || "GET,POST,PUT,DELETE,OPTIONS"
  );
  response.setHeader("Access-Control-Allow-Credentials", "true");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }
  return false;
}

export function createServer(context: Context) {
  const routes: Route[] = getRoutes();
  const server = http.createServer(async (request, response) => {
    try {
      if (sendCorsHeaders(request, response)) return;
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const method = request.method || "GET";
      for (const route of routes) {
        if (route.method !== method) continue;
        const match = route.pattern.exec(url);
        if (!match) continue;
        await route.handler(context, request, response, match);
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not_found" }));
    } catch (error) {
      context.logger.error("server_error", { error: (error as Error)?.message });
      response.statusCode = 500;
      response.end(JSON.stringify({ error: "server_error" }));
    }
  });
  return {
    server,
    start: async () => {
      await initDemoSchema(context.db);
      await new Promise<void>((resolve) => server.listen(context.config.port, resolve));
    },
    stop: async () => {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
    getContext: () => context,
  };
}
