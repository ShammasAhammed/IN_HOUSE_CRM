CREATE TABLE "portal_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"last_sign_in_at" timestamp with time zone,
	"consent_id" uuid
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "consent_records" DROP CONSTRAINT "consent_records_subject_ck";--> statement-breakpoint
ALTER TABLE "asset_comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_comments" ADD COLUMN "portal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_link_tokens" ADD CONSTRAINT "portal_link_tokens_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_invited_by_id_people_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_users_client_idx" ON "portal_users" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_email_uq" ON "portal_users" USING btree (lower("email")) WHERE "portal_users"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_author_ck" CHECK (("asset_comments"."author_id" is null) <> ("asset_comments"."portal_user_id" is null));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request', 'portal_user'));--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_subject_ck" CHECK ("consent_records"."subject_type" in ('lead', 'person', 'client_contact'));