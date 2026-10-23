CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"system" text NOT NULL,
	"account" text,
	"client_id" uuid,
	"level" text,
	"granted_on" date NOT NULL,
	"granted_by_id" uuid,
	"revoked_on" date,
	"revoked_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"source" text,
	"done_at" timestamp with time zone,
	"done_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "checklist_items_kind_ck" CHECK ("checklist_items"."kind" in ('joining', 'exit'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_done_by_id_people_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grants_person_idx" ON "access_grants" USING btree ("person_id") WHERE "access_grants"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "checklist_items_person_idx" ON "checklist_items" USING btree ("person_id","kind") WHERE "checklist_items"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));