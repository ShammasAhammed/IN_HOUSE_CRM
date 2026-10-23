CREATE TABLE "asset_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"action" text,
	"body" text NOT NULL,
	"at_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "asset_comments_action_ck" CHECK ("asset_comments"."action" is null or "asset_comments"."action" in ('submit', 'send_to_client', 'request_changes', 'approve', 'client_approved', 'client_changes')),
	CONSTRAINT "asset_comments_body_ck" CHECK (length("asset_comments"."body") <= 5000 and ("asset_comments"."action" is not null or length("asset_comments"."body") >= 1)),
	CONSTRAINT "asset_comments_at_ck" CHECK ("asset_comments"."at_seconds" is null or "asset_comments"."at_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_comments_asset_idx" ON "asset_comments" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_task_idx" ON "assets" USING btree ("task_id");