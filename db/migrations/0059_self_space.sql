ALTER TABLE "clients" ADD COLUMN "is_self" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_one_self_uq" ON "clients" USING btree ("is_self") WHERE "clients"."is_self";--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_self_internal_ck" CHECK (not "clients"."is_self" or "clients"."is_internal");