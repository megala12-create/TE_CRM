ALTER TABLE "expenses" ADD COLUMN "invoice_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "project" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;