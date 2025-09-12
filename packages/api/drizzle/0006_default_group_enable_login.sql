ALTER TABLE "groups" ADD COLUMN "enable_login" boolean NOT NULL DEFAULT true;

INSERT INTO "groups" ("key", "name", "enable_login")
VALUES ('default', 'Default', true)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "user_groups" ("user_sub", "group_key")
SELECT u.sub, 'default'
FROM users u
LEFT JOIN user_groups ug ON ug.user_sub = u.sub
WHERE ug.user_sub IS NULL;

