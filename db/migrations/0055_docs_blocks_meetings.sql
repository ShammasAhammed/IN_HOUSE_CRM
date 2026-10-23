CREATE TABLE "doc_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"quote" text,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"file_provider" text NOT NULL,
	"file_location" text NOT NULL,
	"file_id" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_files_provider_ck" CHECK ("doc_files"."file_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres'))
);
--> statement-breakpoint
CREATE TABLE "doc_table_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"title" text DEFAULT 'Table' NOT NULL,
	"columns" jsonb NOT NULL,
	"view" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"task_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"kind" text NOT NULL,
	"meeting_date" date NOT NULL,
	"start_time" text,
	"attendees" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"previous_id" uuid,
	"next_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meetings_kind_ck" CHECK ("meetings"."kind" in ('client_call', 'internal', 'review')),
	CONSTRAINT "meetings_repeat_ck" CHECK ("meetings"."repeat" in ('none', 'weekly', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "table_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_resolved_by_id_people_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_files" ADD CONSTRAINT "doc_files_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_files" ADD CONSTRAINT "doc_files_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_table_rows" ADD CONSTRAINT "doc_table_rows_table_id_doc_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."doc_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_table_rows" ADD CONSTRAINT "doc_table_rows_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_table_rows" ADD CONSTRAINT "doc_table_rows_updated_by_id_people_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_tables" ADD CONSTRAINT "doc_tables_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_tables" ADD CONSTRAINT "doc_tables_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_previous_id_meetings_id_fk" FOREIGN KEY ("previous_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_next_id_meetings_id_fk" FOREIGN KEY ("next_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_comments_doc_idx" ON "doc_comments" USING btree ("doc_id") WHERE "doc_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "doc_table_rows_table_idx" ON "doc_table_rows" USING btree ("table_id") WHERE "doc_table_rows"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "doc_tables_doc_idx" ON "doc_tables" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_actions_item_uq" ON "meeting_actions" USING btree ("meeting_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_doc_uq" ON "meetings" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "meetings_client_date_idx" ON "meetings" USING btree ("client_id","meeting_date") WHERE "meetings"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link', 'board', 'board_comment', 'swipe_item', 'doc_table', 'doc_comment', 'meeting'));--> statement-breakpoint
-- Search covers the page's database tables too (Stage 13.4): the same trigram index, one more column in it.
DROP INDEX IF EXISTS "docs_search_trgm_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_search_trgm_idx" ON "docs" USING gin (("title" || ' ' || "body" || ' ' || "table_text") gin_trgm_ops) WHERE "deleted_at" is null;
