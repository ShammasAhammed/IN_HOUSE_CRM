CREATE TABLE "board_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"element_id" text,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "board_files" (
	"board_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_provider" text NOT NULL,
	"file_location" text NOT NULL,
	"file_id" text NOT NULL,
	"file_size" bigint NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_files_board_id_file_key_pk" PRIMARY KEY("board_id","file_key"),
	CONSTRAINT "board_files_provider_ck" CHECK ("board_files"."file_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres'))
);
--> statement-breakpoint
CREATE TABLE "board_people" (
	"board_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"favourite" boolean DEFAULT false NOT NULL,
	"viewed_at" timestamp with time zone,
	CONSTRAINT "board_people_board_id_person_id_pk" PRIMARY KEY("board_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "board_reactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "board_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"scene" jsonb NOT NULL,
	"name" text,
	"object_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_votes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"element_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"section" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"scene" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"object_count" integer DEFAULT 0 NOT NULL,
	"scene_bytes" integer DEFAULT 0 NOT NULL,
	"thumbnail" text,
	"template" text,
	"voting" jsonb,
	"timer" jsonb,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "boards_template_ck" CHECK ("boards"."template" is null or "boards"."template" in ('blank', 'campaign_plan', 'content_month', 'swot', 'student_journey', 'admission_funnel', 'retro'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "client_knowledge" ADD COLUMN "brand_colours" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "board_comments" ADD CONSTRAINT "board_comments_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_comments" ADD CONSTRAINT "board_comments_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_files" ADD CONSTRAINT "board_files_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_files" ADD CONSTRAINT "board_files_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_people" ADD CONSTRAINT "board_people_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_people" ADD CONSTRAINT "board_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reactions" ADD CONSTRAINT "board_reactions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reactions" ADD CONSTRAINT "board_reactions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_versions" ADD CONSTRAINT "board_versions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_versions" ADD CONSTRAINT "board_versions_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_votes" ADD CONSTRAINT "board_votes_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_votes" ADD CONSTRAINT "board_votes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_updated_by_id_people_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_comments_board_idx" ON "board_comments" USING btree ("board_id") WHERE "board_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "board_people_person_idx" ON "board_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "board_reactions_board_idx" ON "board_reactions" USING btree ("board_id") WHERE "board_reactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "board_versions_board_idx" ON "board_versions" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE INDEX "board_votes_board_idx" ON "board_votes" USING btree ("board_id","round") WHERE "board_votes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "boards_client_idx" ON "boards" USING btree ("client_id") WHERE "boards"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "boards_project_idx" ON "boards" USING btree ("project_id") WHERE "boards"."project_id" is not null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel', 'coworker_suggestion', 'client_link', 'board', 'board_comment'));