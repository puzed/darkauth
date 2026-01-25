CREATE TABLE "user_opaque_record_history" (
  "user_sub" text PRIMARY KEY REFERENCES "users"("sub") ON DELETE cascade,
  "envelope" bytea NOT NULL,
  "server_pubkey" bytea NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
