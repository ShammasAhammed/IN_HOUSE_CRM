CREATE TABLE "request_forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_id" uuid NOT NULL,
	"owner_id" uuid,
	"questions" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"public_slug" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" uuid NOT NULL,
	"task_id" uuid,
	"submitted_by_id" uuid,
	"submitter_name" text NOT NULL,
	"submitter_email" text,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_submissions" ADD CONSTRAINT "request_submissions_form_id_request_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."request_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_submissions" ADD CONSTRAINT "request_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_submissions" ADD CONSTRAINT "request_submissions_submitted_by_id_people_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_forms_slug_idx" ON "request_forms" USING btree ("public_slug") WHERE "request_forms"."public_slug" is not null;--> statement-breakpoint
CREATE INDEX "request_submissions_form_idx" ON "request_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form'));