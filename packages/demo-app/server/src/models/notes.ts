import type { PGlite } from "@electric-sql/pglite";

export async function initDemoSchema(db: PGlite) {
  await db.query(`create schema if not exists demo_app`);
  await db.query(`create table if not exists demo_app.notes(
    note_id uuid primary key,
    owner_sub text not null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
  )`);
  await db.query(`create table if not exists demo_app.note_changes(
    note_id uuid not null,
    seq bigserial primary key,
    ciphertext bytea not null,
    aad jsonb not null,
    created_at timestamptz default now() not null
  )`);
  await db.query(`create index if not exists note_changes_note_idx on demo_app.note_changes(note_id, seq)`);
  await db.query(`create table if not exists demo_app.note_access(
    note_id uuid not null,
    recipient_sub text not null,
    dek_jwe text not null,
    grants text not null,
    created_at timestamptz default now() not null,
    primary key(note_id, recipient_sub)
  )`);
}

export async function createNote(db: PGlite, noteId: string, ownerSub: string) {
  await db.query("insert into demo_app.notes(note_id, owner_sub) values($1,$2)", [noteId, ownerSub]);
}

export async function listNotesForUser(db: PGlite, sub: string) {
  return db.query(
    `select n.note_id, n.owner_sub, n.created_at, n.updated_at from demo_app.notes n
     where n.owner_sub=$1 or exists(select 1 from demo_app.note_access a where a.note_id=n.note_id and a.recipient_sub=$1)`,
    [sub]
  );
}

export async function canWriteToNote(db: PGlite, noteId: string, sub: string) {
  const r = await db.query(
    `select 1 from demo_app.notes n where n.note_id=$1 and (n.owner_sub=$2 or exists(select 1 from demo_app.note_access a where a.note_id=n.note_id and a.recipient_sub=$2 and a.grants in ('write')))`,
    [noteId, sub]
  );
  return r.rows.length > 0;
}

export async function appendChange(db: PGlite, noteId: string, ciphertextBase64: string, additionalAuthenticatedData: unknown) {
  await db.query(
    `insert into demo_app.note_changes(note_id, ciphertext, aad) values($1, decode($2,'base64'), $3)`,
    [noteId, ciphertextBase64, additionalAuthenticatedData]
  );
}

export async function deleteNoteCascade(db: PGlite, noteId: string, ownerSub: string) {
  const owner = await db.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, ownerSub]);
  if (owner.rows.length === 0) return false;
  await db.query("delete from demo_app.note_changes where note_id=$1", [noteId]);
  await db.query("delete from demo_app.note_access where note_id=$1", [noteId]);
  await db.query("delete from demo_app.notes where note_id=$1", [noteId]);
  return true;
}

export async function getChangesSince(db: PGlite, noteId: string, since: number) {
  return db.query(
    `select seq, encode(ciphertext,'base64') as ct, aad, created_at from demo_app.note_changes where note_id=$1 and seq>$2 order by seq asc`,
    [noteId, since]
  );
}

export async function shareNote(db: PGlite, noteId: string, ownerSub: string, recipientSub: string, dekJwe: string, grants: string) {
  const owner = await db.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, ownerSub]);
  if (owner.rows.length === 0) return false;
  await db.query(
    `insert into demo_app.note_access(note_id, recipient_sub, dek_jwe, grants) values($1,$2,$3,$4)
     on conflict(note_id, recipient_sub) do update set dek_jwe=excluded.dek_jwe, grants=excluded.grants`,
    [noteId, recipientSub, dekJwe, grants]
  );
  return true;
}

export async function revokeShare(db: PGlite, noteId: string, ownerSub: string, recipientSub: string) {
  const owner = await db.query("select 1 from demo_app.notes where note_id=$1 and owner_sub=$2", [noteId, ownerSub]);
  if (owner.rows.length === 0) return false;
  await db.query("delete from demo_app.note_access where note_id=$1 and recipient_sub=$2", [noteId, recipientSub]);
  return true;
}

export async function getDekForRecipient(db: PGlite, noteId: string, recipientSub: string) {
  return db.query("select dek_jwe from demo_app.note_access where note_id=$1 and recipient_sub=$2", [noteId, recipientSub]);
}
