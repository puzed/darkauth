import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

async function wipe(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("drop schema if exists demo_app cascade");
  } finally {
    c.release();
  }
}

async function push(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("create schema if not exists demo_app");
    await c.query(`create table if not exists demo_app.notes(
      note_id uuid primary key,
      owner_sub text not null,
      created_at timestamptz default now() not null,
      updated_at timestamptz default now() not null
    )`);
    await c.query(`create table if not exists demo_app.note_changes(
      note_id uuid not null,
      seq bigserial primary key,
      ciphertext bytea not null,
      aad jsonb not null,
      created_at timestamptz default now() not null
    )`);
    await c.query(`create index if not exists note_changes_note_idx on demo_app.note_changes(note_id, seq)`);
    await c.query(`create table if not exists demo_app.note_access(
      note_id uuid not null,
      recipient_sub text not null,
      dek_jwe text not null,
      grants text not null,
      created_at timestamptz default now() not null,
      primary key(note_id, recipient_sub)
    )`);
  } finally {
    c.release();
  }
}

function loadDbUri(): string {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    const cfg = parse(raw) as any;
    const url: string | undefined = cfg?.postgresUri;
    if (url) return url;
  }
  return "postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth";
}

async function main() {
  const uri = loadDbUri();
  const pool = new Pool({ connectionString: uri });
  const cmd = process.argv[2];
  if (cmd === "wipe") await wipe(pool);
  else if (cmd === "push") await push(pool);
  else {
    console.error("Usage: demo-db.ts [wipe|push]");
    process.exit(1);
  }
  await pool.end();
}

main();
