import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { parse } from "yaml";
import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

type RootConfig = {
  postgresUri: string;
};

function loadConfig(): RootConfig {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    return parse(raw) as RootConfig;
  }
  throw new Error("config.yaml not found");
}

const root = loadConfig();
const port = 9094;
const issuer = "http://localhost:9080";
const pgUri = root.postgresUri || "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth";
const pool = new Pool({ connectionString: pgUri });

async function init() {
  const client = await pool.connect();
  try {
    await client.query(`create schema if not exists demo_app`);
    await client.query(`create table if not exists demo_app.notes(
      note_id uuid primary key,
      owner_sub text not null,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    )`);
    await client.query(`create table if not exists demo_app.note_changes(
      note_id uuid not null,
      seq bigserial primary key,
      ciphertext bytea not null,
      aad jsonb not null,
      created_at timestamptz default now() not null
    )`);
    await client.query(`create index if not exists note_changes_note_idx on demo_app.note_changes(note_id, seq)`);
    await client.query(`create table if not exists demo_app.note_access(
      note_id uuid not null,
      recipient_sub text not null,
      dek_jwe text not null,
      grants text not null,
      created_at timestamptz default now() not null,
      primary key(note_id, recipient_sub)
    )`);
    
  } finally {
    client.release();
  }
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

async function auth(req: http.IncomingMessage) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return null;
  const token = m[1];
  const jwksUri = new URL("/.well-known/jwks.json", issuer).toString();
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(token, JWKS, { issuer });
  const sub = payload.sub as string | undefined;
  if (!sub) return null;
  return { sub };
}

async function parse(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    console.log(`[demo] req`, req.method, url.pathname);
    if (req.method === "GET" && url.pathname === "/config.js") {
      const client = await pool.connect();
      try {
        const r = await client.query("select value from settings where key='ui_demo' limit 1");
        const v = r.rows[0]?.value || null;
        const fallback = {
          issuer,
          clientId: "app-web",
          redirectUri: "http://localhost:9092/callback",
          demoApi: `http://localhost:${port}`,
        };
        const js = `window.__APP_CONFIG__=${JSON.stringify(v || fallback)};`;
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(js);
      } finally {
        client.release();
      }
      return;
    }
    const origin = req.headers.origin as string | undefined;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "authorization,content-type");
      res.setHeader("Access-Control-Allow-Methods", req.headers["access-control-request-method"] || "GET,POST,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/demo/health") return send(res, 200, { ok: true });
    const user = await auth(req);
    if (!user) return send(res, 401, { error: "unauthorized" });
    const pathname = (url.pathname || "/").replace(/\/+$/g, "") || "/";
    if (req.method === "POST" && pathname === "/demo/notes") {
      console.log("[demo] create note", { sub: user.sub });
      const body = await parse(req);
      const noteId = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.query("insert into demo_app.notes(note_id, owner_sub) values($1,$2)", [noteId, user.sub]);
      } finally {
        client.release();
      }
      return send(res, 200, { note_id: noteId });
    }
    if (req.method === "GET" && pathname === "/demo/notes") {
      console.log("[demo] list notes", { sub: user.sub });
      const client = await pool.connect();
      try {
        const r = await client.query(
          `select n.note_id, n.owner_sub, n.created_at, n.updated_at from demo_app.notes n
           where n.owner_sub=$1 or exists(select 1 from demo_app.note_access a where a.note_id=n.note_id and a.recipient_sub=$1)`,
          [user.sub]
        );
        return send(res, 200, { notes: r.rows });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "DELETE" && url.pathname.startsWith("/demo/notes/")) {
      const noteId = url.pathname.split("/")[3];
      console.log("[demo] delete note", { sub: user.sub, noteId });
      const client = await pool.connect();
      try {
        const owner = await client.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, user.sub]);
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        await client.query("delete from demo_app.note_changes where note_id=$1", [noteId]);
        await client.query("delete from demo_app.note_access where note_id=$1", [noteId]);
        await client.query("delete from demo_app.notes where note_id=$1", [noteId]);
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    if (req.method === "GET" && url.pathname.startsWith("/demo/notes/") && url.pathname.endsWith("/changes")) {
      const noteId = url.pathname.split("/")[3];
      const since = Number(url.searchParams.get("since") || 0);
      console.log("[demo] get changes", { sub: user.sub, noteId, since });
      const client = await pool.connect();
      try {
        const allowed = await client.query(
          `select 1 from demo_app.notes n where n.note_id=$1 and (n.owner_sub=$2 or exists(select 1 from demo_app.note_access a where a.note_id=n.note_id and a.recipient_sub=$2))`,
          [noteId, user.sub]
        );
        if (allowed.rowCount === 0) return send(res, 403, { error: "forbidden" });
        const r = await client.query(
          `select seq, encode(ciphertext,'base64') as ct, aad, created_at from demo_app.note_changes where note_id=$1 and seq>$2 order by seq asc`,
          [noteId, since]
        );
        return send(res, 200, { changes: r.rows.map((x) => ({ seq: x.seq, ciphertext_b64: x.ct, aad: x.aad })) });
      } finally {
        client.release();
      }
    }
    if (req.method === "POST" && url.pathname.startsWith("/demo/notes/") && url.pathname.endsWith("/changes")) {
      const noteId = url.pathname.split("/")[3];
      const body = await parse(req);
      console.log("[demo] append change", { sub: user.sub, noteId });
      const ciphertextB64 = body?.ciphertext_b64;
      const aad = body?.aad;
      if (typeof ciphertextB64 !== "string" || typeof aad !== "object") return send(res, 400, { error: "invalid" });
      const client = await pool.connect();
      try {
        const writable = await client.query(
          `select 1 from demo_app.notes n where n.note_id=$1 and (n.owner_sub=$2 or exists(select 1 from demo_app.note_access a where a.note_id=n.note_id and a.recipient_sub=$2 and a.grants in ('write')))`,
          [noteId, user.sub]
        );
        if (writable.rowCount === 0) return send(res, 403, { error: "forbidden" });
        await client.query(
          `insert into demo_app.note_changes(note_id, ciphertext, aad) values($1, decode($2,'base64'), $3)`,
          [noteId, ciphertextB64, aad]
        );
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    if (req.method === "POST" && url.pathname.startsWith("/demo/notes/") && url.pathname.endsWith("/share")) {
      const noteId = url.pathname.split("/")[3];
      const body = await parse(req);
      const recipientSub = body?.recipient_sub;
      const grants = body?.grants;
      const dekJwe = body?.dek_jwe;
      if (typeof recipientSub !== "string" || typeof grants !== "string" || typeof dekJwe !== "string")
        return send(res, 400, { error: "invalid" });
      const client = await pool.connect();
      try {
        console.log("[demo] share note", { noteId, owner: user.sub, recipientSub, grants, dekLen: dekJwe?.length });
        const owner = await client.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, user.sub]);
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        await client.query(
          `insert into demo_app.note_access(note_id, recipient_sub, dek_jwe, grants) values($1,$2,$3,$4)
           on conflict(note_id, recipient_sub) do update set dek_jwe=excluded.dek_jwe, grants=excluded.grants`,
          [noteId, recipientSub, dekJwe, grants]
        );
        console.log("[demo] share stored", { noteId, recipientSub });
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/demo/notes/") && url.pathname.includes("/share/")) {
      const parts = url.pathname.split("/");
      const noteId = parts[3];
      const recipientSub = decodeURIComponent(parts[5] || "");
      const client = await pool.connect();
      try {
        const owner = await client.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, user.sub]);
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        await client.query("delete from demo_app.note_access where note_id=$1 and recipient_sub=$2", [noteId, recipientSub]);
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    if (req.method === "GET" && url.pathname.startsWith("/demo/notes/") && url.pathname.endsWith("/dek")) {
      const noteId = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
        console.log("[demo] get dek", { noteId, sub: user.sub });
        const r = await client.query(
          "select dek_jwe from demo_app.note_access where note_id=$1 and recipient_sub=$2",
          [noteId, user.sub]
        );
        if (r.rowCount === 0) return send(res, 404, { error: "not_found" });
        return send(res, 200, { dek_jwe: r.rows[0].dek_jwe });
      } finally {
        client.release();
      }
    }
    return send(res, 404, { error: "not_found" });
  } catch (e) {
    console.error("[demo] server error", e);
    return send(res, 500, { error: "server_error" });
  }
});

init().then(() => server.listen(port));
