DO $$ BEGIN
  CREATE TYPE "dashboard_icon_mode" AS ENUM ('letter', 'emoji', 'upload');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "clients"
ADD COLUMN "dashboard_icon_mode" "dashboard_icon_mode" DEFAULT 'letter' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients"
ADD COLUMN "dashboard_icon_emoji" text;
--> statement-breakpoint
ALTER TABLE "clients"
ADD COLUMN "dashboard_icon_letter" text;
--> statement-breakpoint
ALTER TABLE "clients"
ADD COLUMN "dashboard_icon_mime_type" text;
--> statement-breakpoint
ALTER TABLE "clients"
ADD COLUMN "dashboard_icon_data" bytea;
