CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"method" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"note" text,
	"recorded_by_id" uuid,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_method" text,
	"withdrawn_note" text,
	"withdrawn_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_records_subject_ck" CHECK ("consent_records"."subject_type" in ('lead', 'person')),
	CONSTRAINT "consent_records_method_ck" CHECK ("consent_records"."method" in ('form', 'call', 'paper', 'email', 'in_person', 'whatsapp')),
	CONSTRAINT "consent_records_withdrawn_ck" CHECK (("consent_records"."withdrawn_at" is null) = ("consent_records"."withdrawn_method" is null))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_recorded_by_id_people_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_withdrawn_by_id_people_id_fk" FOREIGN KEY ("withdrawn_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_subject_idx" ON "consent_records" USING btree ("subject_type","subject_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record'));