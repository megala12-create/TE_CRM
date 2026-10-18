ALTER TABLE "invoices" ADD COLUMN "order_ref" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "repeat_every" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "next_recurring_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recurring_parent_id" integer;