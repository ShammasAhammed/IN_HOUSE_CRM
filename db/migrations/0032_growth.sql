CREATE TABLE "growth_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid,
	"title" text NOT NULL,
	"target_level" integer,
	"due_date" date,
	"plan" text,
	"proof" text,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "growth_goals_status_ck" CHECK ("growth_goals"."status" in ('active', 'done', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "growth_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"month" date NOT NULL,
	"score" integer NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"goal_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"doc_id" uuid,
	"task_id" uuid,
	"status" text DEFAULT 'assigned' NOT NULL,
	"minutes" integer,
	"cost_paise" bigint,
	"assigned_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "learning_items_kind_ck" CHECK ("learning_items"."kind" in ('course', 'sop', 'practice', 'shadowing', 'stretch')),
	CONSTRAINT "learning_items_status_ck" CHECK ("learning_items"."status" in ('assigned', 'started', 'finished', 'shown'))
);
--> statement-breakpoint
CREATE TABLE "role_skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"skill_id" uuid NOT NULL,
	"required_level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_skills_role_ck" CHECK ("role_skills"."role" in ('owner', 'strategist', 'performance_marketer', 'social_media', 'designer', 'video_editor', 'bdo', 'hr', 'accountant', 'intern')),
	CONSTRAINT "role_skills_level_ck" CHECK ("role_skills"."required_level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "skill_levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"evidence" text,
	"set_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_levels_level_ck" CHECK ("skill_levels"."level" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"description" text,
	"department_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "skills_group_ck" CHECK ("skills"."group" in ('craft', 'client', 'leadership'))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "growth_goals" ADD CONSTRAINT "growth_goals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_goals" ADD CONSTRAINT "growth_goals_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_goals" ADD CONSTRAINT "growth_goals_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_scores" ADD CONSTRAINT "growth_scores_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_goal_id_growth_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."growth_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_assigned_by_id_people_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skills" ADD CONSTRAINT "role_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_levels" ADD CONSTRAINT "skill_levels_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_levels" ADD CONSTRAINT "skill_levels_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_levels" ADD CONSTRAINT "skill_levels_set_by_id_people_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_goals_person_idx" ON "growth_goals" USING btree ("person_id") WHERE "growth_goals"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_scores_month_idx" ON "growth_scores" USING btree ("person_id","month");--> statement-breakpoint
CREATE INDEX "learning_items_person_idx" ON "learning_items" USING btree ("person_id") WHERE "learning_items"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_skills_one_idx" ON "role_skills" USING btree ("role","skill_id") WHERE "role_skills"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "skill_levels_person_idx" ON "skill_levels" USING btree ("person_id","skill_id","created_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'crm_lead', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting', 'mcp_connection', 'lead', 'client_ad_account', 'lead_view', 'task_view', 'task_field', 'template', 'timer', 'request_form', 'doc', 'automation', 'intern_record', 'one_to_one', 'letter', 'skill', 'skill_level', 'growth_goal', 'learning_item'));