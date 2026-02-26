CREATE TYPE "public"."ai_flow_node_kind" AS ENUM('prompt', 'system');--> statement-breakpoint
CREATE TABLE "ai_agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" varchar(50) NOT NULL,
	"orchestrator_node_id" varchar(120) NOT NULL,
	"agent_key" varchar(120) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"kind" "ai_flow_node_kind" DEFAULT 'prompt' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"prompt_definition_id" uuid,
	"execution_phase" integer DEFAULT 1 NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_configs" ADD CONSTRAINT "ai_agent_configs_prompt_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("prompt_definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_configs" ADD CONSTRAINT "ai_agent_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_config_unique_agent_idx" ON "ai_agent_configs" USING btree ("flow_id","orchestrator_node_id","agent_key");--> statement-breakpoint
CREATE INDEX "ai_agent_config_orchestrator_idx" ON "ai_agent_configs" USING btree ("flow_id","orchestrator_node_id");