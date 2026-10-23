CREATE TABLE "attendance_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"location" text NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_out_at" timestamp with time zone,
	"lat_milli" integer,
	"lng_milli" integer,
	"note" text,
	"corrected_by_id" uuid,
	"correction_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attendance_days_location_ck" CHECK ("attendance_days"."location" in ('office', 'home', 'client_site')),
	CONSTRAINT "attendance_days_out_ck" CHECK ("attendance_days"."check_out_at" is null or "attendance_days"."check_out_at" > "attendance_days"."check_in_at")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_corrected_by_id_people_id_fk" FOREIGN KEY ("corrected_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_days_person_date_uq" ON "attendance_days" USING btree ("person_id","work_date") WHERE "attendance_days"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_days_date_idx" ON "attendance_days" USING btree ("work_date");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));