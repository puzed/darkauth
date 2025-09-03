ALTER TABLE "settings" ADD COLUMN "name" text;
ALTER TABLE "settings" ADD COLUMN "type" text;
ALTER TABLE "settings" ADD COLUMN "category" text;
ALTER TABLE "settings" ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE "settings" ADD COLUMN "default_value" jsonb;

