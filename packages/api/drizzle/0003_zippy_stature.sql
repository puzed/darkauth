ALTER TABLE "clients" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "app_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "show_on_user_dashboard" boolean DEFAULT false NOT NULL;