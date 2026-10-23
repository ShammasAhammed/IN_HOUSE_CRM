CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"crm_id" text,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"by_id" uuid,
	"by_name" text,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_type_ck" CHECK ("lead_activities"."type" in ('stage', 'note', 'followup', 'assign', 'edit', 'created', 'other'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"crm_id" text,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"institution" text,
	"contact_role" text,
	"district" text,
	"segment" text,
	"problem" text,
	"timeline" text,
	"seats" integer,
	"admissions" integer,
	"fee_paise" bigint,
	"spend_paise" bigint,
	"commission_paise" bigint,
	"cost_per_admission_paise" bigint,
	"stage" text NOT NULL,
	"score" text,
	"lost_reason" text,
	"origin" text,
	"channel" text,
	"landing" text,
	"campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_content" text,
	"utm_term" text,
	"owner_id" uuid,
	"owner_name" text,
	"next_follow_up_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone,
	"won_at" timestamp with time zone,
	"last_note_at" timestamp with time zone,
	"answers" jsonb,
	"details" jsonb,
	"client_id" uuid,
	"copied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leads_stage_ck" CHECK ("leads"."stage" in ('new', 'contacted', 'audit_booked', 'proposal', 'won', 'lost')),
	CONSTRAINT "leads_score_ck" CHECK ("leads"."score" is null or "leads"."score" in ('hot', 'warm', 'cold'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_by_id_people_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_activities_crm_id_uq" ON "lead_activities" USING btree ("crm_id");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_crm_id_uq" ON "leads" USING btree ("crm_id");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "leads_follow_up_idx" ON "leads" USING btree ("next_follow_up_at") WHERE "leads"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead'));