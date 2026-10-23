CREATE TABLE "google_conversions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"gclid" text NOT NULL,
	"name" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"value_paise" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_conversions" ADD CONSTRAINT "google_conversions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_conversions_lead_stage_uq" ON "google_conversions" USING btree ("lead_id","stage");--> statement-breakpoint
CREATE INDEX "google_conversions_at_idx" ON "google_conversions" USING btree ("at");