INSERT INTO "settings" ("key", "name", "type", "category", "description", "tags", "default_value", "value", "secure", "updated_at") VALUES
('users.prevent_email_enumeration_on_registration', 'Prevent Email Enumeration on Registration', 'boolean', 'Users', 'Pretend registration works for existing users when registering using an existing email. Only applies when email verification and SMTP are enabled.', ARRAY['users', 'email', 'security']::text[], 'false'::jsonb, 'false'::jsonb, false, now()),
('email.templates.signup_existing_account_notice', 'signup_existing_account_notice Template', 'object', 'Email / Templates', 'Template for signup_existing_account_notice', ARRAY['email', 'templates']::text[], '{"subject":"Someone tried to create an account with this email","text":"Hello {{name}},\n\nSomeone attempted to create a new account using this email address, but an account already exists.\n\nIf this was you and you forgot your password, recover access here:\n{{recovery_link}}","html":"<p>Hello {{name}},</p><p>Someone attempted to create a new account using this email address, but an account already exists.</p><p>If this was you and you forgot your password, recover access here:</p><p><a href=\"{{recovery_link}}\">Recover account</a></p>"}'::jsonb, '{"subject":"Someone tried to create an account with this email","text":"Hello {{name}},\n\nSomeone attempted to create a new account using this email address, but an account already exists.\n\nIf this was you and you forgot your password, recover access here:\n{{recovery_link}}","html":"<p>Hello {{name}},</p><p>Someone attempted to create a new account using this email address, but an account already exists.</p><p>If this was you and you forgot your password, recover access here:</p><p><a href=\"{{recovery_link}}\">Recover account</a></p>"}'::jsonb, false, now())
ON CONFLICT ("key") DO UPDATE SET
"name" = excluded."name",
"type" = excluded."type",
"category" = excluded."category",
"description" = excluded."description",
"tags" = excluded."tags",
"default_value" = excluded."default_value",
"secure" = excluded."secure",
"updated_at" = now();
