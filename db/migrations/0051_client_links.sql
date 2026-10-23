CREATE TABLE "client_link_cache" (
	"link_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_link_cache_link_id_key_pk" PRIMARY KEY("link_id","key")
);
--> statement-breakpoint
CREATE TABLE "client_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"google_type" text,
	"google_id" text,
	"file_provider" text,
	"file_location" text,
	"file_id" text,
	"file_name" text,
	"file_size" bigint,
	"tabs" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_readable" boolean DEFAULT true NOT NULL,
	"write_back" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"meta_at" timestamp with time zone,
	"seen_modified_at" timestamp with time zone,
	"noticed_on" date,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "client_links_kind_ck" CHECK ("client_links"."kind" in ('media_plan', 'workbook', 'calendar', 'clarity', 'doc', 'slides', 'artifact', 'other')),
	CONSTRAINT "client_links_google_ck" CHECK ("client_links"."google_type" is null or "client_links"."google_type" in ('sheet', 'doc', 'slides', 'file')),
	CONSTRAINT "client_links_file_ck" CHECK ("client_links"."file_provider" is null or "client_links"."file_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres')),
	CONSTRAINT "client_links_source_ck" CHECK (("client_links"."url" is not null) <> ("client_links"."file_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "client_link_cache" ADD CONSTRAINT "client_link_cache_link_id_client_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."client_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_links" ADD CONSTRAINT "client_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_links" ADD CONSTRAINT "client_links_added_by_id_people_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_links_client_idx" ON "client_links" USING btree ("client_id") WHERE "client_links"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link'));