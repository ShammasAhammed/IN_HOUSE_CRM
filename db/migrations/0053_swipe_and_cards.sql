CREATE TABLE "board_task_links" (
	"board_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_task_links_board_id_element_id_pk" PRIMARY KEY("board_id","element_id")
);
--> statement-breakpoint
CREATE TABLE "link_previews" (
	"url" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"url" text,
	"title" text,
	"text" text,
	"file_provider" text,
	"file_location" text,
	"file_id" text,
	"file_name" text,
	"file_size" bigint,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "swipe_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"board_id" uuid,
	"kind" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"site" text,
	"embed_html" text,
	"file_provider" text,
	"file_location" text,
	"file_id" text,
	"file_name" text,
	"file_size" bigint,
	"content_type" text,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "swipe_items_kind_ck" CHECK ("swipe_items"."kind" in ('link', 'youtube', 'instagram', 'facebook', 'image', 'video')),
	CONSTRAINT "swipe_items_file_ck" CHECK ("swipe_items"."file_provider" is null or "swipe_items"."file_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres')),
	CONSTRAINT "swipe_items_source_ck" CHECK ("swipe_items"."url" is not null or "swipe_items"."file_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "board_task_links" ADD CONSTRAINT "board_task_links_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_task_links" ADD CONSTRAINT "board_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_task_links" ADD CONSTRAINT "board_task_links_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_inbox" ADD CONSTRAINT "share_inbox_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_items" ADD CONSTRAINT "swipe_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_items" ADD CONSTRAINT "swipe_items_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_items" ADD CONSTRAINT "swipe_items_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "swipe_items_client_idx" ON "swipe_items" USING btree ("client_id") WHERE "swipe_items"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link', 'board', 'board_comment', 'swipe_item'));