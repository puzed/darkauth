CREATE TABLE "recovery_keys" (
  "recovery_key_id" text PRIMARY KEY NOT NULL,
  "sub" text NOT NULL,
  "envelope_id" text NOT NULL,
  "label" text,
  "verifier_hash" text NOT NULL,
  "verifier_alg" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "recovery_keys" ADD CONSTRAINT "recovery_keys_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recovery_keys" ADD CONSTRAINT "recovery_keys_envelope_id_key_envelopes_envelope_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."key_envelopes"("envelope_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "recovery_keys_sub_idx" ON "recovery_keys" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "recovery_keys_sub_active_idx" ON "recovery_keys" USING btree ("sub","revoked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_keys_envelope_idx" ON "recovery_keys" USING btree ("envelope_id");
