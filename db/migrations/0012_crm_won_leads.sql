CREATE TABLE "crm_won_leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"crm_lead_id" text NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"phone" text,
	"segment" text,
	"owner_name" text,
	"won_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "crm_won_leads" ADD CONSTRAINT "crm_won_leads_dismissed_by_id_people_id_fk" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_won_leads_lead_uq" ON "crm_won_leads" USING btree ("crm_lead_id");--> statement-breakpoint
CREATE INDEX "crm_won_leads_won_idx" ON "crm_won_leads" USING btree ("won_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));