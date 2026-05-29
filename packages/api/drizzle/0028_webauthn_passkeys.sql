CREATE TABLE "webauthn_credentials" (
  "credential_id" text PRIMARY KEY NOT NULL,
  "sub" text NOT NULL,
  "label" text,
  "public_key" bytea NOT NULL,
  "sign_count" integer DEFAULT 0 NOT NULL,
  "transports" text[] DEFAULT '{}' NOT NULL,
  "aaguid" text,
  "backup_eligible" boolean DEFAULT false NOT NULL,
  "backup_state" boolean DEFAULT false NOT NULL,
  "user_verified" boolean DEFAULT false NOT NULL,
  "prf_supported" boolean DEFAULT false NOT NULL,
  "prf_salt" bytea,
  "prf_envelope_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
  "challenge_id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "challenge" text NOT NULL,
  "sub" text,
  "credential_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_prf_envelope_id_key_envelopes_envelope_id_fk" FOREIGN KEY ("prf_envelope_id") REFERENCES "public"."key_envelopes"("envelope_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_credential_id_webauthn_credentials_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."webauthn_credentials"("credential_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_challenge_unique" ON "webauthn_challenges" USING btree ("challenge");
--> statement-breakpoint
CREATE INDEX "webauthn_credentials_sub_idx" ON "webauthn_credentials" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "webauthn_credentials_sub_active_idx" ON "webauthn_credentials" USING btree ("sub","revoked_at");
--> statement-breakpoint
CREATE INDEX "webauthn_credentials_prf_envelope_idx" ON "webauthn_credentials" USING btree ("prf_envelope_id");
--> statement-breakpoint
CREATE INDEX "webauthn_challenges_type_idx" ON "webauthn_challenges" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "webauthn_challenges_sub_idx" ON "webauthn_challenges" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges" USING btree ("expires_at");
