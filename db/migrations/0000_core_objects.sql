CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"head_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"work_email" text NOT NULL,
	"work_phone" text,
	"personal_email" text,
	"personal_phone" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"emergency_contact_relation" text,
	"department_id" uuid,
	"reports_to_id" uuid,
	"job_title" text NOT NULL,
	"employment_type" text NOT NULL,
	"work_location" text DEFAULT 'office' NOT NULL,
	"join_date" date NOT NULL,
	"end_date" date,
	"capacity_minutes_per_week" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "people_employment_type_ck" CHECK ("people"."employment_type" in ('full_time', 'part_time', 'intern', 'freelancer')),
	CONSTRAINT "people_work_location_ck" CHECK ("people"."work_location" in ('office', 'home', 'hybrid')),
	CONSTRAINT "people_status_ck" CHECK ("people"."status" in ('active', 'left')),
	CONSTRAINT "people_capacity_ck" CHECK ("people"."capacity_minutes_per_week" >= 0 and "people"."capacity_minutes_per_week" <= 4800)
);
--> statement-breakpoint
CREATE TABLE "person_roles" (
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_roles_person_id_role_pk" PRIMARY KEY("person_id","role"),
	CONSTRAINT "person_roles_role_ck" CHECK ("person_roles"."role" in ('owner', 'strategist', 'performance_marketer', 'social_media', 'designer', 'video_editor', 'bdo', 'hr', 'accountant', 'intern'))
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"phone" text,
	"email" text,
	"whatsapp" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_members" (
	"client_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_members_client_id_person_id_pk" PRIMARY KEY("client_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"segment" text DEFAULT 'other' NOT NULL,
	"city" text,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"start_date" date,
	"gstin" text,
	"billing_address" text,
	"crm_lead_id" text,
	"lead_strategist_id" uuid,
	"is_internal" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clients_segment_ck" CHECK ("clients"."segment" in ('coaching', 'college', 'school', 'edtech', 'training_institute', 'other')),
	CONSTRAINT "clients_status_ck" CHECK ("clients"."status" in ('onboarding', 'active', 'paused', 'churned'))
);
--> statement-breakpoint
CREATE TABLE "service_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_task_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage_position" integer,
	"due_offset_days" integer DEFAULT 7 NOT NULL,
	"estimate_minutes" integer,
	"default_role" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "service_task_templates_role_ck" CHECK ("service_task_templates"."default_role" is null or "service_task_templates"."default_role" in ('owner', 'strategist', 'performance_marketer', 'social_media', 'designer', 'video_editor', 'bdo', 'hr', 'accountant', 'intern'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "engagement_fees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"effective_from" date NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "engagement_fees_amount_ck" CHECK ("engagement_fees"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "engagement_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"base_budget_minutes" integer NOT NULL,
	"rollover_in_minutes" integer DEFAULT 0 NOT NULL,
	"fee_paise" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"warned_80_at" timestamp with time zone,
	"warned_100_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "engagement_periods_status_ck" CHECK ("engagement_periods"."status" in ('open', 'closed')),
	CONSTRAINT "engagement_periods_range_ck" CHECK ("engagement_periods"."period_end" >= "engagement_periods"."period_start")
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"renewal_date" date,
	"hours_budget_minutes" integer DEFAULT 0 NOT NULL,
	"rollover_policy" text DEFAULT 'expire' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "engagements_kind_ck" CHECK ("engagements"."kind" in ('retainer', 'one_off')),
	CONSTRAINT "engagements_status_ck" CHECK ("engagements"."status" in ('draft', 'active', 'paused', 'ended')),
	CONSTRAINT "engagements_rollover_ck" CHECK ("engagements"."rollover_policy" in ('expire', 'rollover')),
	CONSTRAINT "engagements_budget_ck" CHECK ("engagements"."hours_budget_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"target_count" integer NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deliverables_target_ck" CHECK ("deliverables"."target_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_stage_id" uuid,
	"lead_id" uuid,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_status_ck" CHECK ("projects"."status" in ('planned', 'active', 'on_hold', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"owner_id" uuid,
	"reviewer_id" uuid,
	"stage_id" uuid,
	"deliverable_id" uuid,
	"start_date" date,
	"due_date" date,
	"estimate_minutes" integer,
	"completed_at" timestamp with time zone,
	"rank" text DEFAULT 'm' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_status_ck" CHECK ("tasks"."status" in ('todo', 'in_progress', 'in_review', 'blocked', 'done')),
	CONSTRAINT "tasks_priority_ck" CHECK ("tasks"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "tasks_estimate_ck" CHECK ("tasks"."estimate_minutes" is null or "tasks"."estimate_minutes" >= 0),
	CONSTRAINT "tasks_done_ck" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid,
	"work_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "time_entries_minutes_ck" CHECK ("time_entries"."minutes" > 0 and "time_entries"."minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_location" text NOT NULL,
	"storage_file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"note" text,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "asset_versions_provider_ck" CHECK ("asset_versions"."storage_provider" in ('google_drive', 'r2', 'local', 'external_link')),
	CONSTRAINT "asset_versions_version_ck" CHECK ("asset_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"task_id" uuid,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"approval_state" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"approved_version_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_kind_ck" CHECK ("assets"."kind" in ('image', 'video', 'document', 'link', 'other')),
	CONSTRAINT "assets_approval_ck" CHECK ("assets"."approval_state" in ('draft', 'internal_review', 'client_review', 'changes_requested', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"client_id" uuid,
	"person_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'time_entry', 'asset', 'deliverable', 'service', 'leave_request', 'holiday', 'setting'))
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_person_id_people_id_fk" FOREIGN KEY ("head_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_reports_to_id_people_id_fk" FOREIGN KEY ("reports_to_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_lead_strategist_id_people_id_fk" FOREIGN KEY ("lead_strategist_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_stages" ADD CONSTRAINT "service_stages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_task_templates" ADD CONSTRAINT "service_task_templates_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_periods" ADD CONSTRAINT "engagement_periods_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_stage_id_project_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_people_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_people_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."project_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_uploaded_by_id_people_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_approved_version_id_asset_versions_id_fk" FOREIGN KEY ("approved_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_approved_by_id_people_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_name_uq" ON "departments" USING btree ("name") WHERE "departments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "people_work_email_uq" ON "people" USING btree (lower("work_email")) WHERE "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_members_person_idx" ON "client_members" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name") WHERE "clients"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "service_stages_service_idx" ON "service_stages" USING btree ("service_id","position");--> statement-breakpoint
CREATE INDEX "service_task_templates_service_idx" ON "service_task_templates" USING btree ("service_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "services_key_uq" ON "services" USING btree ("key") WHERE "services"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "engagement_fees_engagement_idx" ON "engagement_fees" USING btree ("engagement_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_periods_uq" ON "engagement_periods" USING btree ("engagement_id","period_start");--> statement-breakpoint
CREATE INDEX "engagements_client_idx" ON "engagements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "deliverables_engagement_idx" ON "deliverables" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "project_stages_project_idx" ON "project_stages" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_engagement_idx" ON "projects" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_open_idx" ON "tasks" USING btree ("owner_id","due_date") WHERE "tasks"."deleted_at" is null and "tasks"."status" <> 'done';--> statement-breakpoint
CREATE INDEX "tasks_project_status_idx" ON "tasks" USING btree ("project_id","status") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_client_status_idx" ON "tasks" USING btree ("client_id","status") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "time_entries_engagement_date_idx" ON "time_entries" USING btree ("engagement_id","work_date") WHERE "time_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_person_date_idx" ON "time_entries" USING btree ("person_id","work_date") WHERE "time_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_task_idx" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_uq" ON "asset_versions" USING btree ("asset_id","version");--> statement-breakpoint
CREATE INDEX "assets_client_idx" ON "assets" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_client_idx" ON "events" USING btree ("client_id","occurred_at") WHERE "events"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "events_person_idx" ON "events" USING btree ("person_id","occurred_at") WHERE "events"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "events_occurred_idx" ON "events" USING btree ("occurred_at");