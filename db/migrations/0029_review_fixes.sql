ALTER TABLE "request_submissions" ADD COLUMN "submitter_key" text;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_search_trgm_idx" ON "docs" USING gin (("title" || ' ' || "body") gin_trgm_ops) WHERE "deleted_at" is null;
