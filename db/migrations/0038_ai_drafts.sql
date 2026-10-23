CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"instructions" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"ai_usage_id" uuid,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_drafts_kind_ck" CHECK ("ai_drafts"."kind" in ('caption', 'brief', 'script', 'report_prep')),
	CONSTRAINT "ai_drafts_status_ck" CHECK ("ai_drafts"."status" in ('draft', 'approved', 'rejected')),
	CONSTRAINT "ai_drafts_reviewed_ck" CHECK (("ai_drafts"."status" = 'draft') = ("ai_drafts"."reviewed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_requested_by_id_people_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_ai_usage_id_ai_usage_id_fk" FOREIGN KEY ("ai_usage_id") REFERENCES "public"."ai_usage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_reviewed_by_id_people_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_drafts_task_idx" ON "ai_drafts" USING btree ("task_id","created_at");