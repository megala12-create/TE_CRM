ALTER TABLE "expense_categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();