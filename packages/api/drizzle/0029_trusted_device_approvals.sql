CREATE TABLE "trusted_devices" (
  "device_id" text PRIMARY KEY NOT NULL,
  "sub" text NOT NULL,
  "label" text,
  "public_jwk" jsonb NOT NULL,
  "key_handle" text,
  "envelope_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "device_approval_requests" (
  "request_id" text PRIMARY KEY NOT NULL,
  "sub" text NOT NULL,
  "requester_session_id" text,
  "new_device_public_jwk" jsonb NOT NULL,
  "new_device_label" text,
  "verification_code" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "approved_by_device_id" text,
  "encrypted_approval" bytea,
  "approval_aad" bytea,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "approved_at" timestamp,
  "consumed_at" timestamp,
  "denied_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_envelope_id_key_envelopes_envelope_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."key_envelopes"("envelope_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_approval_requests" ADD CONSTRAINT "device_approval_requests_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_approval_requests" ADD CONSTRAINT "device_approval_requests_approved_by_device_id_trusted_devices_device_id_fk" FOREIGN KEY ("approved_by_device_id") REFERENCES "public"."trusted_devices"("device_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trusted_devices_sub_idx" ON "trusted_devices" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "trusted_devices_sub_active_idx" ON "trusted_devices" USING btree ("sub","revoked_at");
--> statement-breakpoint
CREATE INDEX "trusted_devices_envelope_idx" ON "trusted_devices" USING btree ("envelope_id");
--> statement-breakpoint
CREATE INDEX "device_approval_requests_sub_idx" ON "device_approval_requests" USING btree ("sub");
--> statement-breakpoint
CREATE INDEX "device_approval_requests_sub_status_idx" ON "device_approval_requests" USING btree ("sub","status");
--> statement-breakpoint
CREATE INDEX "device_approval_requests_expires_at_idx" ON "device_approval_requests" USING btree ("expires_at");
