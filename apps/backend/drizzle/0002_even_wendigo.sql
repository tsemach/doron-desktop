CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt" jsonb,
	"response" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_cents" integer,
	"finish_reason" text,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"billing_period" text NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text NOT NULL,
	"monthly_budget_cents" integer NOT NULL,
	"gateway_rate_limit_tier" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_periods" ADD CONSTRAINT "ai_usage_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_periods_user_period_idx" ON "ai_usage_periods" USING btree ("user_id","billing_period");--> statement-breakpoint
-- Seed the Pro plan's monthly AI budget. No 'free' row: the usage service
-- treats a missing plan as "not entitled to cloud AI", not a $0 budget.
INSERT INTO "plans" ("tier", "monthly_budget_cents") VALUES ('pro', 2000);