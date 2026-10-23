CREATE TABLE "chat_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"client_id" uuid,
	"name" text,
	"created_by_id" uuid,
	"archived_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_channels_kind_ck" CHECK ("chat_channels"."kind" in ('client', 'team', 'direct')),
	CONSTRAINT "chat_channels_client_ck" CHECK (("chat_channels"."kind" = 'client') = ("chat_channels"."client_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"channel_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chat_members_channel_id_person_id_pk" PRIMARY KEY("channel_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentions" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"file_provider" text,
	"file_location" text,
	"file_id" text,
	"file_name" text,
	"file_type" text,
	"file_size" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chat_messages_body_ck" CHECK (length("chat_messages"."body") <= 4000 and (length("chat_messages"."body") >= 1 or "chat_messages"."file_id" is not null)),
	CONSTRAINT "chat_messages_file_ck" CHECK ("chat_messages"."file_provider" is null or "chat_messages"."file_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres'))
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"channel_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_reads_channel_id_person_id_pk" PRIMARY KEY("channel_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_added_by_id_people_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_client_uq" ON "chat_channels" USING btree ("client_id") WHERE "chat_channels"."kind" = 'client';--> statement-breakpoint
CREATE INDEX "chat_members_person_idx" ON "chat_members" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_changes_idx" ON "chat_messages" USING btree ("channel_id","updated_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user', 'chat_channel'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_search_trgm_idx" ON "chat_messages" USING gin ("body" gin_trgm_ops) WHERE "deleted_at" is null;
