ALTER TABLE "pending_auth" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "clients"
SET "scopes" = array_append(
  "scopes",
  '{"key":"darkauth.users:read","description":"Search and read users from the directory"}'
)
WHERE "client_id" = 'demo-public-client'
  AND NOT "scopes" @> ARRAY['{"key":"darkauth.users:read","description":"Search and read users from the directory"}']::text[];
