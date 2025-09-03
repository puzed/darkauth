import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { parse } from "yaml";
import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

function loadCfg(): any {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return parse(fs.readFileSync(p, "utf8"));
  return {};
}
const root = loadCfg();
const port = 9093;
const issuer = root?.api?.issuer || "http://localhost:9080";
const pgUri = root?.postgresUri || "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth";
const pool = new Pool({ connectionString: pgUri });

async function init() {
  const client = await pool.connect();
  try {
    await client.query(`create schema if not exists demo_app`);
    
    // Enhanced notes table with metadata
    await client.query(`create table if not exists demo_app.notes(
      note_id uuid primary key,
      owner_sub text not null,
      collection_id uuid,
      title_ciphertext bytea,
      tags_ciphertext bytea,
      is_public boolean default false,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    )`);
    
    // Note changes for CRDT support
    await client.query(`create table if not exists demo_app.note_changes(
      note_id uuid not null,
      seq bigserial primary key,
      ciphertext bytea not null,
      aad jsonb not null,
      created_at timestamptz default now() not null
    )`);
    await client.query(`create index if not exists note_changes_note_idx on demo_app.note_changes(note_id, seq)`);
    
    // Note access control
    await client.query(`create table if not exists demo_app.note_access(
      note_id uuid not null,
      recipient_sub text not null,
      dek_jwe text not null,
      grants text not null,
      created_at timestamptz default now() not null,
      primary key(note_id, recipient_sub)
    )`);
    
    // User profiles with public keys
    await client.query(`create table if not exists demo_app.user_profiles(
      sub text primary key,
      display_name text,
      avatar_url text,
      public_key_jwk jsonb not null,
      wrapped_private_key text,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    )`);
    
    // Collections for organizing notes
    await client.query(`create table if not exists demo_app.collections(
      collection_id uuid primary key default gen_random_uuid(),
      owner_sub text not null,
      name_ciphertext bytea not null,
      icon text,
      color text,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    )`);
    
    // Collection membership
    await client.query(`create table if not exists demo_app.collection_members(
      collection_id uuid not null references demo_app.collections(collection_id) on delete cascade,
      member_sub text not null,
      wrapped_collection_key text not null,
      role text not null,
      created_at timestamptz default now() not null,
      primary key(collection_id, member_sub)
    )`);
  } finally {
    client.release();
  }
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 
    "content-type": "application/json", 
    "content-length": Buffer.byteLength(data) 
  });
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
  return { sub, email: payload.email as string | undefined, name: payload.name as string | undefined };
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
    
    // CORS headers
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "authorization,content-type");
      res.setHeader("Access-Control-Allow-Methods", req.headers["access-control-request-method"] || "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
    }
    
    // Health check
    if (req.method === "GET" && url.pathname === "/demo/health") {
      return send(res, 200, { ok: true });
    }
    
    const user = await auth(req);
    if (!user) return send(res, 401, { error: "unauthorized" });
    
    // User profile endpoints
    if (req.method === "GET" && url.pathname === "/demo/users/me") {
      const client = await pool.connect();
      try {
        const result = await client.query(
          "select sub, display_name, avatar_url, public_key_jwk from demo_app.user_profiles where sub=$1",
          [user.sub]
        );
        if (result.rowCount === 0) {
          return send(res, 404, { error: "profile_not_found" });
        }
        return send(res, 200, result.rows[0]);
      } finally {
        client.release();
      }
    }
    
    if (req.method === "PUT" && url.pathname === "/demo/users/me") {
      const body = await parse(req);
      const client = await pool.connect();
      try {
        await client.query(
          `insert into demo_app.user_profiles(sub, display_name, avatar_url, public_key_jwk, wrapped_private_key)
           values($1, $2, $3, $4, $5)
           on conflict(sub) do update set
           display_name=excluded.display_name,
           avatar_url=excluded.avatar_url,
           public_key_jwk=excluded.public_key_jwk,
           wrapped_private_key=excluded.wrapped_private_key,
           updated_at=now()`,
          [user.sub, body.display_name || user.name, body.avatar_url, body.public_key_jwk, body.wrapped_private_key]
        );
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "GET" && url.pathname.match(/^\/demo\/users\/[^\/]+$/)) {
      const sub = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
        const result = await client.query(
          "select sub, display_name, avatar_url, public_key_jwk from demo_app.user_profiles where sub=$1",
          [sub]
        );
        if (result.rowCount === 0) {
          return send(res, 404, { error: "user_not_found" });
        }
        return send(res, 200, result.rows[0]);
      } finally {
        client.release();
      }
    }
    
    if (req.method === "GET" && url.pathname === "/demo/users/search") {
      const query = url.searchParams.get("q") || "";
      const client = await pool.connect();
      try {
        const result = await client.query(
          `select sub, display_name, avatar_url, public_key_jwk 
           from demo_app.user_profiles 
           where display_name ilike $1 
           limit 10`,
          [`%${query}%`]
        );
        return send(res, 200, { users: result.rows });
      } finally {
        client.release();
      }
    }
    
    // Notes endpoints
    if (req.method === "POST" && url.pathname === "/demo/notes") {
      const body = await parse(req);
      const noteId = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.query(
          "insert into demo_app.notes(note_id, owner_sub, collection_id) values($1,$2,$3)",
          [noteId, user.sub, body.collection_id || null]
        );
        // Create initial user profile if not exists
        await client.query(
          `insert into demo_app.user_profiles(sub, display_name, public_key_jwk)
           values($1, $2, $3)
           on conflict(sub) do nothing`,
          [user.sub, user.name || user.email, body.user_public_key || {}]
        );
      } finally {
        client.release();
      }
      return send(res, 200, { note_id: noteId });
    }
    
    if (req.method === "GET" && url.pathname === "/demo/notes") {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `select n.note_id, n.owner_sub, n.collection_id, n.is_public, n.created_at, n.updated_at,
                  n.title_ciphertext, n.tags_ciphertext
           from demo_app.notes n
           where n.owner_sub=$1 or exists(
             select 1 from demo_app.note_access a 
             where a.note_id=n.note_id and a.recipient_sub=$1
           )
           order by n.updated_at desc`,
          [user.sub]
        );
        return send(res, 200, { 
          notes: r.rows.map(row => ({
            ...row,
            title_ciphertext: row.title_ciphertext ? row.title_ciphertext.toString('base64') : null,
            tags_ciphertext: row.tags_ciphertext ? row.tags_ciphertext.toString('base64') : null
          }))
        });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "PUT" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/metadata$/)) {
      const noteId = url.pathname.split("/")[3];
      const body = await parse(req);
      const client = await pool.connect();
      try {
        const updates = [];
        const values = [noteId, user.sub];
        let paramCount = 2;
        
        if (body.title_ciphertext) {
          paramCount++;
          updates.push(`title_ciphertext = decode($${paramCount}, 'base64')`);
          values.push(body.title_ciphertext);
        }
        
        if (body.tags_ciphertext) {
          paramCount++;
          updates.push(`tags_ciphertext = decode($${paramCount}, 'base64')`);
          values.push(body.tags_ciphertext);
        }
        
        if (updates.length > 0) {
          await client.query(
            `update demo_app.notes set ${updates.join(', ')}, updated_at = now()
             where note_id=$1 and owner_sub=$2`,
            values
          );
        }
        
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "DELETE" && url.pathname.startsWith("/demo/notes/")) {
      const noteId = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
        const owner = await client.query(
          "select 1 from demo_app.notes where note_id=$1 and owner_sub=$2",
          [noteId, user.sub]
        );
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        await client.query("delete from demo_app.note_changes where note_id=$1", [noteId]);
        await client.query("delete from demo_app.note_access where note_id=$1", [noteId]);
        await client.query("delete from demo_app.notes where note_id=$1", [noteId]);
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    // Note changes endpoints
    if (req.method === "GET" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/changes$/)) {
      const noteId = url.pathname.split("/")[3];
      const since = Number(url.searchParams.get("since") || 0);
      const client = await pool.connect();
      try {
        const allowed = await client.query(
          `select 1 from demo_app.notes n 
           where n.note_id=$1 and (n.owner_sub=$2 or exists(
             select 1 from demo_app.note_access a 
             where a.note_id=n.note_id and a.recipient_sub=$2
           ))`,
          [noteId, user.sub]
        );
        if (allowed.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        const r = await client.query(
          `select seq, encode(ciphertext,'base64') as ct, aad, created_at 
           from demo_app.note_changes 
           where note_id=$1 and seq>$2 
           order by seq asc`,
          [noteId, since]
        );
        return send(res, 200, { 
          changes: r.rows.map((x) => ({ 
            seq: x.seq, 
            ciphertext_b64: x.ct, 
            aad: x.aad 
          })) 
        });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "POST" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/changes$/)) {
      const noteId = url.pathname.split("/")[3];
      const body = await parse(req);
      const ciphertextB64 = body?.ciphertext_b64;
      const aad = body?.aad;
      if (typeof ciphertextB64 !== "string" || typeof aad !== "object") {
        return send(res, 400, { error: "invalid" });
      }
      
      const client = await pool.connect();
      try {
        const writable = await client.query(
          `select 1 from demo_app.notes n 
           where n.note_id=$1 and (n.owner_sub=$2 or exists(
             select 1 from demo_app.note_access a 
             where a.note_id=n.note_id and a.recipient_sub=$2 and a.grants in ('write')
           ))`,
          [noteId, user.sub]
        );
        if (writable.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        await client.query(
          `insert into demo_app.note_changes(note_id, ciphertext, aad) 
           values($1, decode($2,'base64'), $3)`,
          [noteId, ciphertextB64, aad]
        );
        
        await client.query(
          "update demo_app.notes set updated_at = now() where note_id=$1",
          [noteId]
        );
        
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    // Sharing endpoints
    if (req.method === "POST" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/share$/)) {
      const noteId = url.pathname.split("/")[3];
      const body = await parse(req);
      const recipientSub = body?.recipient_sub;
      const grants = body?.grants;
      const dekJwe = body?.dek_jwe;
      
      if (typeof recipientSub !== "string" || typeof grants !== "string" || typeof dekJwe !== "string") {
        return send(res, 400, { error: "invalid" });
      }
      
      const client = await pool.connect();
      try {
        const owner = await client.query(
          "select 1 from demo_app.notes where note_id=$1 and owner_sub=$2",
          [noteId, user.sub]
        );
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        await client.query(
          `insert into demo_app.note_access(note_id, recipient_sub, dek_jwe, grants) 
           values($1,$2,$3,$4)
           on conflict(note_id, recipient_sub) 
           do update set dek_jwe=excluded.dek_jwe, grants=excluded.grants`,
          [noteId, recipientSub, dekJwe, grants]
        );
        
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "GET" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/access$/)) {
      const noteId = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
        const owner = await client.query(
          "select 1 from demo_app.notes where note_id=$1 and owner_sub=$2",
          [noteId, user.sub]
        );
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        const r = await client.query(
          `select a.recipient_sub, a.grants, a.created_at, p.display_name, p.avatar_url
           from demo_app.note_access a
           left join demo_app.user_profiles p on p.sub = a.recipient_sub
           where a.note_id=$1`,
          [noteId]
        );
        
        return send(res, 200, { access: r.rows });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "DELETE" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/share\/[^\/]+$/)) {
      const parts = url.pathname.split("/");
      const noteId = parts[3];
      const recipientSub = decodeURIComponent(parts[5] || "");
      
      const client = await pool.connect();
      try {
        const owner = await client.query(
          "select 1 from demo_app.notes where note_id=$1 and owner_sub=$2",
          [noteId, user.sub]
        );
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        await client.query(
          "delete from demo_app.note_access where note_id=$1 and recipient_sub=$2",
          [noteId, recipientSub]
        );
        
        return send(res, 200, { success: true });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "GET" && url.pathname.match(/^\/demo\/notes\/[^\/]+\/dek$/)) {
      const noteId = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
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
    
    // Collections endpoints
    if (req.method === "GET" && url.pathname === "/demo/collections") {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `select c.collection_id, encode(c.name_ciphertext, 'base64') as name_ciphertext, 
                  c.icon, c.color, c.created_at, c.updated_at
           from demo_app.collections c
           where c.owner_sub=$1 or exists(
             select 1 from demo_app.collection_members m 
             where m.collection_id=c.collection_id and m.member_sub=$1
           )`,
          [user.sub]
        );
        return send(res, 200, { collections: r.rows });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "POST" && url.pathname === "/demo/collections") {
      const body = await parse(req);
      const collectionId = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.query(
          `insert into demo_app.collections(collection_id, owner_sub, name_ciphertext, icon, color)
           values($1, $2, decode($3, 'base64'), $4, $5)`,
          [collectionId, user.sub, body.name_ciphertext, body.icon, body.color]
        );
        return send(res, 200, { collection_id: collectionId });
      } finally {
        client.release();
      }
    }
    
    if (req.method === "DELETE" && url.pathname.match(/^\/demo\/collections\/[^\/]+$/)) {
      const collectionId = url.pathname.split("/")[3];
      const client = await pool.connect();
      try {
        const owner = await client.query(
          "select 1 from demo_app.collections where collection_id=$1 and owner_sub=$2",
          [collectionId, user.sub]
        );
        if (owner.rowCount === 0) return send(res, 403, { error: "forbidden" });
        
        await client.query("delete from demo_app.collections where collection_id=$1", [collectionId]);
        return send(res, 200, { success: true });
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

init().then(() => {
  server.listen(port);
  console.log(`[demo] Server listening on port ${port}`);
});
