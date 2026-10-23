CREATE TABLE "intern_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"batch" text NOT NULL,
	"mentor_id" uuid,
	"planned_end_date" date,
	"focus" text,
	"strengths" text,
	"worked_on" text,
	"hire_again" text,
	"review_notes" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"in_talent_pool" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "intern_records_hire_again_ck" CHECK ("intern_records"."hire_again" is null or "intern_records"."hire_again" in ('yes', 'maybe', 'no'))
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_no" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"issued_on" date NOT NULL,
	"issued_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "letters_kind_ck" CHECK ("letters"."kind" in ('offer', 'internship_certificate', 'experience', 'relieving'))
);
--> statement-breakpoint
CREATE TABLE "one_to_ones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"meeting_date" date NOT NULL,
	"discussed" text NOT NULL,
	"agreed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "training" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "intern_records" ADD CONSTRAINT "intern_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intern_records" ADD CONSTRAINT "intern_records_mentor_id_people_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intern_records" ADD CONSTRAINT "intern_records_reviewed_by_id_people_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_issued_by_id_people_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_to_ones" ADD CONSTRAINT "one_to_ones_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_to_ones" ADD CONSTRAINT "one_to_ones_lead_id_people_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intern_records_person_idx" ON "intern_records" USING btree ("person_id") WHERE "intern_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "letters_person_idx" ON "letters" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "one_to_ones_person_idx" ON "one_to_ones" USING btree ("person_id","meeting_date");--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter'));