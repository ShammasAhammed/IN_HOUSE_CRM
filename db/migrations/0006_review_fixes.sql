DROP INDEX "tasks_recurrence_due_uq";--> statement-breakpoint
DROP INDEX "engagement_periods_uq";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_date" date;--> statement-breakpoint
-- Existing recurring tasks stand for the date they were made for.
UPDATE "tasks" SET "recurrence_date" = "due_date" WHERE "recurrence_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_fees_uq" ON "engagement_fees" USING btree ("engagement_id","effective_from") WHERE "engagement_fees"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_recurrence_date_uq" ON "tasks" USING btree ("recurrence_id","recurrence_date") WHERE "tasks"."recurrence_id" is not null and "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_periods_uq" ON "engagement_periods" USING btree ("engagement_id","period_start") WHERE "engagement_periods"."deleted_at" is null;