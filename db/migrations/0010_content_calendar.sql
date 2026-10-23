CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"publish_on" date NOT NULL,
	"publish_time" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"asset_id" uuid,
	"owner_id" uuid,
	"caption" text,
	"published_url" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "content_items_channel_ck" CHECK ("content_items"."channel" in ('instagram_post', 'instagram_reel', 'instagram_story', 'facebook_post', 'youtube', 'linkedin', 'whatsapp', 'meta_ad', 'google_ad', 'other')),
	CONSTRAINT "content_items_status_ck" CHECK ("content_items"."status" in ('idea', 'in_production', 'ready', 'scheduled', 'published')),
	CONSTRAINT "content_items_time_ck" CHECK ("content_items"."publish_time" is null or "content_items"."publish_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_type_ck";--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_client_idx" ON "content_items" USING btree ("client_id","publish_on") WHERE "content_items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "content_items_asset_idx" ON "content_items" USING btree ("asset_id") WHERE "content_items"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_type_ck" CHECK ("events"."entity_type" in ('person', 'attendance_day', 'access_grant', 'checklist_item', 'person_document', 'department', 'client', 'client_contact', 'engagement', 'engagement_period', 'project', 'task', 'task_comment', 'task_recurrence', 'time_entry', 'asset', 'content_item', 'deliverable', 'service', 'leave_request', 'leave_type', 'leave_grant', 'holiday', 'setting'));