CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leave_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"half_days" integer NOT NULL,
	"granted_on" date NOT NULL,
	"expires_on" date,
	"reason" text NOT NULL,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leave_grants_nonzero_ck" CHECK ("leave_grants"."half_days" <> 0)
);
--> statement-breakpoint
CREATE TABLE "leave_quotas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"employment_type" text NOT NULL,
	"half_days_per_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leave_quotas_employment_ck" CHECK ("leave_quotas"."employment_type" in ('full_time', 'part_time', 'intern', 'freelancer')),
	CONSTRAINT "leave_quotas_amount_ck" CHECK ("leave_quotas"."half_days_per_year" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" text,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approver_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"cancelled_from" date,
	"cancel_requested_from" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leave_requests_status_ck" CHECK ("leave_requests"."status" in ('pending', 'approved', 'rejected', 'cancelled', 'revoked')),
	CONSTRAINT "leave_requests_range_ck" CHECK ("leave_requests"."end_date" >= "leave_requests"."start_date"),
	CONSTRAINT "leave_requests_half_ck" CHECK ("leave_requests"."half_day" is null or ("leave_requests"."half_day" in ('first_half', 'second_half') and "leave_requests"."start_date" = "leave_requests"."end_date"))
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"uses_balance" boolean DEFAULT true NOT NULL,
	"granted_only" boolean DEFAULT false NOT NULL,
	"grant_expiry_days" integer,
	"allow_half_day" boolean DEFAULT true NOT NULL,
	"max_backdate_days" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "person_roles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_members" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_quotas" ADD CONSTRAINT "leave_quotas_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_id_people_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_people_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_date_uq" ON "holidays" USING btree ("date") WHERE "holidays"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "leave_grants_person_idx" ON "leave_grants" USING btree ("person_id","leave_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_quotas_uq" ON "leave_quotas" USING btree ("leave_type_id","employment_type") WHERE "leave_quotas"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "leave_requests_person_idx" ON "leave_requests" USING btree ("person_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_dates_idx" ON "leave_requests" USING btree ("start_date","end_date") WHERE "leave_requests"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "leave_requests_approver_idx" ON "leave_requests" USING btree ("approver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_key_uq" ON "leave_types" USING btree ("key") WHERE "leave_types"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'time_entry', 'asset', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));