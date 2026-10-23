CREATE TABLE "client_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid,
	"month" date NOT NULL,
	"leads" integer,
	"spend_paise" bigint,
	"calls_booked" integer,
	"admissions" integer,
	"target_leads" integer,
	"target_admissions" integer,
	"leads_source" text DEFAULT 'manual' NOT NULL,
	"spend_source" text DEFAULT 'manual' NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_results_month_ck" CHECK (extract(day from "client_results"."month") = 1),
	CONSTRAINT "client_results_counts_ck" CHECK (coalesce("client_results"."leads", 0) >= 0 and coalesce("client_results"."spend_paise", 0) >= 0 and coalesce("client_results"."calls_booked", 0) >= 0 and coalesce("client_results"."admissions", 0) >= 0 and coalesce("client_results"."target_leads", 0) >= 0 and coalesce("client_results"."target_admissions", 0) >= 0),
	CONSTRAINT "client_results_leads_source_ck" CHECK ("client_results"."leads_source" in ('manual', 'meta')),
	CONSTRAINT "client_results_spend_source_ck" CHECK ("client_results"."spend_source" in ('manual', 'meta'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "client_results" ADD CONSTRAINT "client_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_results" ADD CONSTRAINT "client_results_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_results" ADD CONSTRAINT "client_results_updated_by_id_people_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_results_month_uq" ON "client_results" USING btree ("client_id","month");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result'));