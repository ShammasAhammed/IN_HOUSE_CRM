CREATE TABLE "lead_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"channel" text,
	"active" boolean DEFAULT true NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"last_lead_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_external_id_uq" ON "leads" USING btree ("external_id");