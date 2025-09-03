CREATE TABLE IF NOT EXISTS "opaque_login_sessions" (
  "id" text PRIMARY KEY,
  "server_state" bytea NOT NULL,
  "identity_s" text NOT NULL,
  "identity_u" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "opaque_login_sessions_expires_idx"
  ON "opaque_login_sessions" ("expires_at");

