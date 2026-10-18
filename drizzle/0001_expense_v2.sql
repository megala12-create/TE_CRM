CREATE TABLE "vendors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vendors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"gstin" text,
	"phone" text,
	"email" text,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "payment_mode" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "payment_mode" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vendor_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax1_name" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax1_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax2_name" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax2_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "total" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_key" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_name" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_type" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_size" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "repeat_every" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "next_recurring_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "recurring_parent_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_recurring_idx" ON "expenses" USING btree ("next_recurring_date");--> statement-breakpoint
-- Data: move free-text vendors into the vendors table
INSERT INTO "vendors" ("name", "gstin") SELECT DISTINCT ON (lower(trim("vendor"))) trim("vendor"), "vendor_gstin" FROM "expenses" WHERE coalesce(trim("vendor"), '') <> '' ORDER BY lower(trim("vendor")), "vendor_gstin" NULLS LAST;--> statement-breakpoint
UPDATE "expenses" e SET "vendor_id" = v."id" FROM "vendors" v WHERE lower(trim(e."vendor")) = lower(v."name");--> statement-breakpoint
-- Data: old "amount" included tax; new model is amount (pre-tax) + tax = total
UPDATE "expenses" SET "total" = "amount", "amount" = "amount" - "tax_amount";
