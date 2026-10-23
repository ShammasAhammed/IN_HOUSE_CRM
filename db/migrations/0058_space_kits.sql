CREATE TABLE "space_kit_items" (
	"space_id" uuid NOT NULL,
	"kit" text NOT NULL,
	"item_key" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_kit_items_space_id_kit_item_key_pk" PRIMARY KEY("space_id","kit","item_key")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "space_kit_items" ADD CONSTRAINT "space_kit_items_space_id_clients_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_kit_items" ADD CONSTRAINT "space_kit_items_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_kit_items_space_idx" ON "space_kit_items" USING btree ("space_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link', 'board', 'board_comment', 'swipe_item', 'doc_table', 'doc_comment', 'meeting', 'gallery_template', 'preset', 'goal', 'space_kit'));