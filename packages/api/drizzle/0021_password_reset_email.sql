CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_sub" text NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "requested_ip_hash" text,
  "user_agent_hash" text,
  CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "password_reset_tokens_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "users"("sub") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_sub_idx" ON "password_reset_tokens" USING btree ("user_sub");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_active_user_idx" ON "password_reset_tokens" USING btree ("user_sub","consumed_at");
--> statement-breakpoint
INSERT INTO "settings" ("key", "name", "type", "category", "description", "tags", "default_value", "value", "secure", "updated_at") VALUES
('users.password_reset_email_enabled', 'Email Password Reset Enabled', 'boolean', 'Users / Password Reset', 'Allow users to request password reset links by email', ARRAY['users', 'email', 'password-reset']::text[], 'false'::jsonb, 'false'::jsonb, false, now()),
('users.password_reset_show_login_link', 'Show Forgot Password Link', 'boolean', 'Users / Password Reset', 'Show the forgot password link on the user login page', ARRAY['users', 'email', 'password-reset']::text[], 'true'::jsonb, 'true'::jsonb, false, now()),
('users.password_reset_token_ttl_minutes', 'Password Reset Token TTL (minutes)', 'number', 'Users / Password Reset', 'Minutes until password reset links expire', ARRAY['users', 'email', 'password-reset']::text[], '30'::jsonb, '30'::jsonb, false, now()),
('users.password_reset_request_cooldown_minutes', 'Password Reset Cooldown (minutes)', 'number', 'Users / Password Reset', 'Minimum minutes between reset emails for one account', ARRAY['users', 'email', 'password-reset']::text[], '5'::jsonb, '5'::jsonb, false, now()),
('users.password_reset_max_requests_per_hour', 'Password Reset Max Requests Per Hour', 'number', 'Users / Password Reset', 'Maximum reset emails per account per hour', ARRAY['users', 'email', 'password-reset']::text[], '3'::jsonb, '3'::jsonb, false, now()),
('email.templates.password_recovery', 'password_recovery Template', 'object', 'Email / Templates', 'Template for password_recovery', ARRAY['email', 'templates']::text[], '{"subject":"Reset your password","text":"Hello {{name}},\n\nUse this link to reset your password:\n{{reset_link}}\n\nThis link expires in {{expires_minutes}} minutes.","html":"<p>Hello {{name}},</p><p>Use this link to reset your password:</p><p><a href=\"{{reset_link}}\">Reset password</a></p><p>This link expires in {{expires_minutes}} minutes.</p>"}'::jsonb, '{"subject":"Reset your password","text":"Hello {{name}},\n\nUse this link to reset your password:\n{{reset_link}}\n\nThis link expires in {{expires_minutes}} minutes.","html":"<p>Hello {{name}},</p><p>Use this link to reset your password:</p><p><a href=\"{{reset_link}}\">Reset password</a></p><p>This link expires in {{expires_minutes}} minutes.</p>"}'::jsonb, false, now())
ON CONFLICT ("key") DO UPDATE SET
"name" = excluded."name",
"type" = excluded."type",
"category" = excluded."category",
"description" = excluded."description",
"tags" = excluded."tags",
"default_value" = excluded."default_value",
"secure" = excluded."secure",
"updated_at" = now();
