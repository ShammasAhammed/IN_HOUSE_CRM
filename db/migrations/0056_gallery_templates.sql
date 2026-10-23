CREATE TABLE "gallery_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"scope" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by_id" uuid,
	"thumbnail" text,
	"preview" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "gallery_templates_kind_ck" CHECK ("gallery_templates"."kind" in ('board', 'page')),
	CONSTRAINT "gallery_templates_scope_ck" CHECK ("gallery_templates"."scope" in ('company', 'mine'))
);
--> statement-breakpoint
CREATE TABLE "gallery_uses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"value" jsonb NOT NULL,
	"scope" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "presets_kind_ck" CHECK ("presets"."kind" in ('palette', 'sticky', 'layout')),
	CONSTRAINT "presets_scope_ck" CHECK ("presets"."scope" in ('company', 'mine'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "gallery_templates" ADD CONSTRAINT "gallery_templates_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_templates" ADD CONSTRAINT "gallery_templates_approved_by_id_people_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_uses" ADD CONSTRAINT "gallery_uses_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gallery_templates_kind_idx" ON "gallery_templates" USING btree ("kind") WHERE "gallery_templates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "gallery_uses_key_idx" ON "gallery_uses" USING btree ("template_key");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link', 'board', 'board_comment', 'swipe_item', 'doc_table', 'doc_comment', 'meeting', 'gallery_template', 'preset'));