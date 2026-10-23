CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"storage" text NOT NULL,
	"file_name" text,
	"size_bytes" bigint,
	"tables" integer,
	"rows" integer,
	"check_passed" boolean,
	"message" text,
	CONSTRAINT "backup_runs_status_ck" CHECK ("backup_runs"."status" in ('ok', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "backup_runs_started_idx" ON "backup_runs" USING btree ("started_at");