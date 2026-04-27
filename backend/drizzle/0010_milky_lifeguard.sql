CREATE TABLE "evolution_whatsapp_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"startup_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evolution_whatsapp_links" ADD CONSTRAINT "evolution_whatsapp_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_whatsapp_links" ADD CONSTRAINT "evolution_whatsapp_links_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_whatsapp_links_phone_idx" ON "evolution_whatsapp_links" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "evolution_whatsapp_links_email_idx" ON "evolution_whatsapp_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "evolution_whatsapp_links_user_id_idx" ON "evolution_whatsapp_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evolution_whatsapp_links_startup_id_idx" ON "evolution_whatsapp_links" USING btree ("startup_id");