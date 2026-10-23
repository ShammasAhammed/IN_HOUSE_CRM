CREATE TABLE "chat_portal_reads" (
	"channel_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	CONSTRAINT "chat_portal_reads_channel_id_portal_user_id_pk" PRIMARY KEY("channel_id","portal_user_id")
);
--> statement-breakpoint
ALTER TABLE "chat_channels" DROP CONSTRAINT "chat_channels_kind_ck";--> statement-breakpoint
ALTER TABLE "chat_channels" DROP CONSTRAINT "chat_channels_client_ck";--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "portal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_portal_reads" ADD CONSTRAINT "chat_portal_reads_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_portal_reads" ADD CONSTRAINT "chat_portal_reads_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_shared_uq" ON "chat_channels" USING btree ("client_id") WHERE "chat_channels"."kind" = 'shared';--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_kind_ck" CHECK ("chat_channels"."kind" in ('client', 'team', 'direct', 'shared'));--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_client_ck" CHECK (("chat_channels"."kind" in ('client', 'shared')) = ("chat_channels"."client_id" is not null));--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_ck" CHECK (("chat_messages"."author_id" is null) <> ("chat_messages"."portal_user_id" is null));