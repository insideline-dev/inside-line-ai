ALTER TABLE "clara_conversations" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD COLUMN "external_thread_id" text;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clara_messages" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "clara_messages" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "clara_messages" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clara_conv_channel_thread_idx" ON "clara_conversations" USING btree ("channel","external_thread_id");--> statement-breakpoint
CREATE INDEX "clara_conv_normalized_phone_idx" ON "clara_conversations" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "clara_msg_external_message_id_idx" ON "clara_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "clara_msg_channel_idx" ON "clara_messages" USING btree ("channel");