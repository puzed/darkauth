import type { Route, Context } from "../types";
import type http from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { initDemoSchema, listNotesForUser, createNote, deleteNoteCascade, getChangesSince, canWriteToNote, appendChange, shareNote, revokeShare, getDekForRecipient } from "../models/notes";

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown) {
  const serializedBody = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(serializedBody),
  });
  response.end(serializedBody);
}

async function parseJsonBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {} as unknown;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {} as unknown;
  }
}

async function requireAuthentication(context: Context, request: http.IncomingMessage) {
  const authorizationHeader = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader);
  if (!match) return null as null | { sub: string };
  const token = match[1];
  const jwksUri = new URL("/.well-known/jwks.json", context.config.issuer).toString();
  const jwkSet = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(token, jwkSet, { issuer: context.config.issuer });
  const sub = payload.sub as string | undefined;
  if (!sub) return null;
  return { sub };
}

const BodyCreateNote = z.object({ collection_id: z.string().uuid().optional() }).strict().partial();
const BodyAppendChange = z.object({ ciphertext_b64: z.string(), aad: z.unknown() });
const BodyShare = z.object({ recipient_sub: z.string(), grants: z.string(), dek_jwe: z.string() });

export function getRoutes(): Route[] {
  const routes: Route[] = [];

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/config.js" }),
    handler: async (context, _request, response) => {
      const configurationResult = await context.db.query(
        "select value from settings where key='ui_demo' limit 1"
      );
      const storedConfiguration = configurationResult.rows[0]?.value || null;
      const fallbackConfiguration = {
        issuer: context.config.issuer,
        clientId: "app-web",
        redirectUri: "http://localhost:9092/callback",
        demoApi: `http://localhost:${context.config.port}`,
      };
      const script = `window.__APP_CONFIG__=${JSON.stringify(storedConfiguration || fallbackConfiguration)};`;
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/javascript; charset=utf-8");
      response.end(script);
    },
    operation: { summary: "Runtime configuration" },
  });

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/demo/health" }),
    handler: async (_context, _request, response) => sendJson(response, 200, { ok: true }),
    operation: { summary: "Health" },
  });

  routes.push({
    method: "POST",
    pattern: new URLPattern({ pathname: "/demo/notes" }),
    handler: async (context, request, response) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      await initDemoSchema(context.db);
      const body = BodyCreateNote.safeParse(await parseJsonBody(request));
      if (!body.success) return sendJson(response, 400, { error: "invalid" });
      const noteId = crypto.randomUUID();
      await createNote(context.db, noteId, user.sub);
      return sendJson(response, 200, { note_id: noteId });
    },
    operation: { summary: "Create note", requestBody: { contentType: "application/json", schema: BodyCreateNote }, responses: { "200": { description: "Created" } } },
  });

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/demo/notes" }),
    handler: async (context, request, response) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const queryResult = await listNotesForUser(context.db, user.sub);
      return sendJson(response, 200, { notes: queryResult.rows });
    },
    operation: { summary: "List notes" },
  });

  routes.push({
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/demo/notes/:id" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const isDeleted = await deleteNoteCascade(context.db, noteId, user.sub);
      if (!isDeleted) return sendJson(response, 403, { error: "forbidden" });
      return sendJson(response, 200, { success: true });
    },
    operation: { summary: "Delete note" },
  });

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/demo/notes/:id/changes" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const requestUrl = new URL(request.url || "", `http://${request.headers.host}`);
      const since = Number(requestUrl.searchParams.get("since") || 0);
      const accessibleNotes = await listNotesForUser(context.db, user.sub);
      const isAllowed = accessibleNotes.rows.some(
        (row) => String(row.note_id) === String(noteId)
      );
      if (!isAllowed) return sendJson(response, 403, { error: "forbidden" });
      const changeResult = await getChangesSince(context.db, noteId, since);
      return sendJson(response, 200, {
        changes: changeResult.rows.map((row) => ({
          seq: row.seq,
          ciphertext_b64: row.ct,
          aad: row.aad,
        })),
      });
    },
    operation: { summary: "Get changes" },
  });

  routes.push({
    method: "POST",
    pattern: new URLPattern({ pathname: "/demo/notes/:id/changes" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const body = BodyAppendChange.safeParse(await parseJsonBody(request));
      if (!body.success) return sendJson(response, 400, { error: "invalid" });
      const canWrite = await canWriteToNote(context.db, noteId, user.sub);
      if (!canWrite) return sendJson(response, 403, { error: "forbidden" });
      await appendChange(context.db, noteId, body.data.ciphertext_b64, body.data.aad);
      return sendJson(response, 200, { success: true });
    },
    operation: { summary: "Append change", requestBody: { contentType: "application/json", schema: BodyAppendChange }, responses: { "200": { description: "OK" } } },
  });

  routes.push({
    method: "POST",
    pattern: new URLPattern({ pathname: "/demo/notes/:id/share" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const parsed = BodyShare.safeParse(await parseJsonBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: "invalid" });
      const isShared = await shareNote(
        context.db,
        noteId,
        user.sub,
        parsed.data.recipient_sub,
        parsed.data.dek_jwe,
        parsed.data.grants
      );
      if (!isShared) return sendJson(response, 403, { error: "forbidden" });
      return sendJson(response, 200, { success: true });
    },
    operation: { summary: "Share note", requestBody: { contentType: "application/json", schema: BodyShare }, responses: { "200": { description: "OK" } } },
  });

  routes.push({
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/demo/notes/:id/share/:recipient" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const recipientSub = decodeURIComponent(match.pathname.groups.recipient);
      const isRevoked = await revokeShare(context.db, noteId, user.sub, recipientSub);
      if (!isRevoked) return sendJson(response, 403, { error: "forbidden" });
      return sendJson(response, 200, { success: true });
    },
    operation: { summary: "Revoke share" },
  });

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/demo/notes/:id/dek" }),
    handler: async (context, request, response, match) => {
      const user = await requireAuthentication(context, request);
      if (!user) return sendJson(response, 401, { error: "unauthorized" });
      const noteId = match.pathname.groups.id;
      const dekResult = await getDekForRecipient(context.db, noteId, user.sub);
      if (dekResult.rowCount === 0) return sendJson(response, 404, { error: "not_found" });
      return sendJson(response, 200, { dek_jwe: dekResult.rows[0].dek_jwe });
    },
    operation: { summary: "Get DEK" },
  });

  routes.push({
    method: "GET",
    pattern: new URLPattern({ pathname: "/openapi.json" }),
    handler: async (_context, _request, response) => {
      const paths: Record<string, any> = {};
      for (const route of routes) {
        const pathPattern = route.pattern.pathname?.toString() || "/";
        const openApiPath = pathPattern.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
        const methodName = route.method.toLowerCase();
        paths[openApiPath] = paths[openApiPath] || {};
        paths[openApiPath][methodName] = {
          summary: route.operation?.summary,
          responses: route.operation?.responses || { "200": { description: "OK" } },
        };
        if (route.operation?.requestBody) {
          paths[openApiPath][methodName].requestBody = {
            content: { [route.operation.requestBody.contentType]: { schema: {} } },
          };
        }
      }
      const document = { openapi: "3.1.0", info: { title: "DarkNotes Demo API", version: "0.1.0" }, paths };
      return sendJson(response, 200, document);
    },
    operation: { summary: "OpenAPI" },
  });

  return routes;
}
