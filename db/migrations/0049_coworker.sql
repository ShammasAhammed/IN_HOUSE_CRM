CREATE TABLE "coworker_digests" (
	"day" date PRIMARY KEY NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coworker_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"keys" text[] NOT NULL,
	"title" text NOT NULL,
	"why" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"wording" text,
	"status" text NOT NULL,
	"results" jsonb,
	"snoozed_until" date,
	"wake_on_client_reply" boolean DEFAULT false NOT NULL,
	"snoozed_at" timestamp with time zone,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coworker_status_ck" CHECK ("coworker_suggestions"."status" in ('open', 'approved', 'partly', 'dismissed', 'snoozed'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "coworker_id" uuid;--> statement-breakpoint
ALTER TABLE "coworker_suggestions" ADD CONSTRAINT "coworker_suggestions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coworker_suggestions" ADD CONSTRAINT "coworker_suggestions_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coworker_suggestions" ADD CONSTRAINT "coworker_suggestions_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coworker_client_kind_idx" ON "coworker_suggestions" USING btree ("client_id","kind","decided_at");--> statement-breakpoint
CREATE INDEX "coworker_channel_idx" ON "coworker_suggestions" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "coworker_snoozed_idx" ON "coworker_suggestions" USING btree ("snoozed_until") WHERE "coworker_suggestions"."status" = 'snoozed';--> statement-breakpoint
CREATE INDEX "coworker_keys_idx" ON "coworker_suggestions" USING gin ("keys");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion'));