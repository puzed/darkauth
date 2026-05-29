CREATE TABLE "account_keys" (
  "key_id" text PRIMARY KEY NOT NULL,
  "sub" text NOT NULL,
  "version" text DEFAULT 'v2' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "rotated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "key_envelopes" (
  "envelope_id" text PRIMARY KEY NOT NULL,
  "key_id" text NOT NULL,
  "sub" text NOT NULL,
  "type" text NOT NULL,
  "label" text,
  "wrapping_alg" text NOT NULL,
  "wrapped_key" bytea NOT NULL,
  "aad" bytea NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "key_envelopes" ADD CONSTRAINT "key_envelopes_key_id_account_keys_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."account_keys"("key_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "key_envelopes" ADD CONSTRAINT "key_envelopes_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_keys_sub_idx" ON "account_keys" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "account_keys_sub_status_idx" ON "account_keys" USING btree ("sub","status");
--> statement-breakpoint
CREATE INDEX "key_envelopes_key_id_idx" ON "key_envelopes" USING btree ("key_id");
--> statement-breakpoint
CREATE INDEX "key_envelopes_sub_idx" ON "key_envelopes" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "key_envelopes_sub_type_idx" ON "key_envelopes" USING btree ("sub","type");
--> statement-breakpoint
INSERT INTO "account_keys" ("key_id", "sub", "version", "status", "created_at")
SELECT 'legacy-drk:' || "sub", "sub", 'v1-drk', 'active', "updated_at"
FROM "wrapped_root_keys"
ON CONFLICT ("key_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "key_envelopes" (
  "envelope_id",
  "key_id",
  "sub",
  "type",
  "label",
  "wrapping_alg",
  "wrapped_key",
  "aad",
  "metadata",
  "created_at"
)
SELECT
  'legacy-drk-password:' || "sub",
  'legacy-drk:' || "sub",
  "sub",
  'password',
  'Legacy password envelope',
  'OPAQUE-HKDF-SHA256+A256GCM/v1',
  "wrapped_drk",
  convert_to("sub", 'UTF8'),
  jsonb_build_object('version', 'v1-drk', 'migrated_from', 'wrapped_root_keys'),
  "updated_at"
FROM "wrapped_root_keys"
ON CONFLICT ("envelope_id") DO NOTHING;
