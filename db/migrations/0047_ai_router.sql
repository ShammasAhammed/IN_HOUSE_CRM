CREATE TABLE "lead_ai_scores" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"score" integer NOT NULL,
	"junk" boolean NOT NULL,
	"sure_percent" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"scored_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lead_ai_scores_label_ck" CHECK ("lead_ai_scores"."label" in ('hot', 'warm', 'cold')),
	CONSTRAINT "lead_ai_scores_score_ck" CHECK ("lead_ai_scores"."score" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "escalated_from" text;--> statement-breakpoint
ALTER TABLE "lead_ai_scores" ADD CONSTRAINT "lead_ai_scores_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;