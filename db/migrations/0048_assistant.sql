CREATE TABLE "assistant_day_summaries" (
	"person_id" uuid NOT NULL,
	"day" date NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_day_summaries_person_id_day_pk" PRIMARY KEY("person_id","day")
);
--> statement-breakpoint
CREATE TABLE "assistant_promises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid NOT NULL,
	"link" text NOT NULL,
	"excerpt" text NOT NULL,
	"due_phrase" text,
	"due_on" date,
	"status" text NOT NULL,
	"remind_on" date,
	"reminded_at" timestamp with time zone,
	"task_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_promises_source_ck" CHECK ("assistant_promises"."source" in ('chat', 'task', 'creative')),
	CONSTRAINT "assistant_promises_status_ck" CHECK ("assistant_promises"."status" in ('open', 'reminder', 'task', 'kept', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "assistant_day_summaries" ADD CONSTRAINT "assistant_day_summaries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_promises" ADD CONSTRAINT "assistant_promises_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_promises" ADD CONSTRAINT "assistant_promises_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_promises_source_uq" ON "assistant_promises" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "assistant_promises_person_idx" ON "assistant_promises" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "assistant_promises_remind_idx" ON "assistant_promises" USING btree ("remind_on") WHERE "assistant_promises"."status" = 'reminder' and "assistant_promises"."reminded_at" is null;