CREATE TABLE "space_access_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"level" text NOT NULL,
	"reason" text NOT NULL,
	"expires_on" date,
	"two_step" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"owner_alone" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_access_requests_level_ck" CHECK ("space_access_requests"."level" in ('view', 'comment', 'edit', 'manage')),
	CONSTRAINT "space_access_requests_status_ck" CHECK ("space_access_requests"."status" in ('pending', 'approved', 'refused', 'confirmed', 'cancelled')),
	CONSTRAINT "space_access_requests_two_step_ck" CHECK ("space_access_requests"."two_step" is null or "space_access_requests"."two_step" in ('yes', 'not_sure'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "client_members" ADD COLUMN "level" text DEFAULT 'edit' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_members" ADD COLUMN "expires_on" date;--> statement-breakpoint
ALTER TABLE "client_members" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "access_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space_access_requests" ADD CONSTRAINT "space_access_requests_space_id_clients_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_access_requests" ADD CONSTRAINT "space_access_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_access_requests" ADD CONSTRAINT "space_access_requests_requested_by_id_people_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_access_requests" ADD CONSTRAINT "space_access_requests_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_access_requests_person_idx" ON "space_access_requests" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_access_requests_open_uq" ON "space_access_requests" USING btree ("space_id","person_id") WHERE "space_access_requests"."status" in ('pending', 'approved');--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_level_ck" CHECK ("client_members"."level" in ('view', 'comment', 'edit', 'manage'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_sensitive_internal_ck" CHECK (not "clients"."is_sensitive" or "clients"."is_internal");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('invoice', 'person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item', 'client_result', 'client_knowledge', 'client_campaign', 'client_file', 'client_report', 'consent_record', 'space_access_request'));--> statement-breakpoint
-- Stage 14.2 carry-over: members of spaces from 14.1 keep their access at "edit", confirmed; one event each says so.
-- (A migration can't call lib/id.ts, so these event ids are random UUIDs rather than v7.)
INSERT INTO "events" ("id", "actor_id", "action", "entity_type", "entity_id", "client_id", "person_id", "data") SELECT gen_random_uuid(), NULL, 'space.access_carried_over', 'client', m."client_id", m."client_id", m."person_id", jsonb_build_object('level', 'edit', 'space', c."name") FROM "client_members" m JOIN "clients" c ON c."id" = m."client_id" WHERE c."is_internal" AND m."deleted_at" IS NULL;
