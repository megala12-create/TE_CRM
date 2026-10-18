DROP INDEX "quotations_status_idx";--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "kind" text DEFAULT 'quotation' NOT NULL;--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("kind","status");