CREATE TABLE "person_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"provider" text NOT NULL,
	"location" text NOT NULL,
	"file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"expires_on" date,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "person_documents_kind_ck" CHECK ("person_documents"."kind" in ('offer_letter', 'contract', 'id_proof', 'certificate', 'letter', 'other')),
	CONSTRAINT "person_documents_provider_ck" CHECK ("person_documents"."provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres'))
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folder" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asset_versions" DROP CONSTRAINT "asset_versions_provider_ck";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_uploaded_by_id_people_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_documents_person_idx" ON "person_documents" USING btree ("person_id") WHERE "person_documents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stored_files_folder_idx" ON "stored_files" USING btree ("folder") WHERE "stored_files"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_provider_ck" CHECK ("asset_versions"."storage_provider" in ('google_drive', 'r2', 'local', 'external_link', 'postgres'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));