CREATE TYPE "public"."aisle" AS ENUM('fruits_legumes', 'boulangerie', 'boucherie', 'poissonnerie', 'charcuterie_traiteur', 'cremerie', 'fromagerie', 'epicerie_salee', 'feculents', 'conserves', 'condiments_epices', 'epicerie_sucree', 'monde', 'surgeles', 'boissons');--> statement-breakpoint
CREATE TYPE "public"."base_unit" AS ENUM('g', 'ml', 'piece');--> statement-breakpoint
CREATE TYPE "public"."expiry_kind" AS ENUM('dlc', 'ddm');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."pantry_location" AS ENUM('fridge', 'freezer', 'cupboard');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'generating', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('manual', 'receipt', 'open_prices', 'seed');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'pending_review', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('mass', 'volume', 'count', 'fuzzy', 'ingredient');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"seed" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_seed" CHECK ("generation_job"."seed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "household_invite" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"portion_factor" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"sensitive" "bytea",
	"present_days" smallint[] DEFAULT '{0,1,2,3,4,5,6}'::smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_portion" CHECK ("household_member"."portion_factor" > 0 and "household_member"."portion_factor" <= 3)
);
--> statement-breakpoint
CREATE TABLE "household" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"weekly_budget_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"meal_slots" "meal_slot"[] DEFAULT '{dinner}'::meal_slot[] NOT NULL,
	"max_prep_minutes" smallint[] DEFAULT '{30,30,30,30,30,60,60}'::smallint[] NOT NULL,
	"repeat_window_days" smallint DEFAULT 7 NOT NULL,
	"equipment" text[] DEFAULT '{plaques,four}'::text[] NOT NULL,
	"default_store_id" uuid,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_budget_nonneg" CHECK ("household"."weekly_budget_cents" is null or "household"."weekly_budget_cents" >= 0),
	CONSTRAINT "household_repeat" CHECK ("household"."repeat_window_days" between 0 and 28),
	CONSTRAINT "household_prep_len" CHECK (array_length("household"."max_prep_minutes", 1) = 7),
	CONSTRAINT "household_currency" CHECK ("household"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"synonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"aisle" "aisle" NOT NULL,
	"base_unit" "base_unit" NOT NULL,
	"density_g_per_ml" numeric(8, 4),
	"piece_weight_g" numeric(10, 3),
	"nutrition" jsonb,
	"nutrition_source" text,
	"ciqual_code" text,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"traits" text[] DEFAULT '{}'::text[] NOT NULL,
	"season_months" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"protein_type" text,
	"vegetable_type" text,
	"perishable_days" smallint,
	"canonical_id" text,
	CONSTRAINT "ingredient_id_slug" CHECK ("ingredient"."id" ~ '^[a-z0-9_]+$'),
	CONSTRAINT "ingredient_density_pos" CHECK ("ingredient"."density_g_per_ml" is null or "ingredient"."density_g_per_ml" > 0),
	CONSTRAINT "ingredient_piece_pos" CHECK ("ingredient"."piece_weight_g" is null or "ingredient"."piece_weight_g" > 0),
	CONSTRAINT "ingredient_allergens_eu" CHECK ("ingredient"."allergens" <@ array['gluten','crustaces','oeufs','poissons','arachides','soja','lait','fruits_a_coque','celeri','moutarde','sesame','sulfites','lupin','mollusques']::text[]),
	CONSTRAINT "ingredient_traits" CHECK ("ingredient"."traits" <@ array['meat','pork','fish','seafood','dairy','lactose','egg','honey','alcohol','gelatin']::text[]),
	CONSTRAINT "ingredient_months" CHECK ("ingredient"."season_months" <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "meal_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" jsonb,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_monday" CHECK (extract(isodow from "meal_plan"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "oauth_account" (
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_account_provider_provider_user_id_pk" PRIMARY KEY("provider","provider_user_id"),
	CONSTRAINT "oauth_provider" CHECK ("oauth_account"."provider" in ('google','apple'))
);
--> statement-breakpoint
CREATE TABLE "pantry_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"best_before" date,
	"expiry_kind" "expiry_kind" DEFAULT 'ddm' NOT NULL,
	"location" "pantry_location" DEFAULT 'cupboard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_qty_nonneg" CHECK ("pantry_item"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "planned_meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"day" smallint NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric(6, 2) NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"cook_big" boolean DEFAULT false NOT NULL,
	"leftover_of_id" uuid,
	"cooked_at" timestamp with time zone,
	"explanations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "planned_meal_day" CHECK ("planned_meal"."day" between 0 and 6),
	CONSTRAINT "planned_meal_servings" CHECK ("planned_meal"."servings" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid,
	"household_id" uuid,
	"price_cents" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "price_source" NOT NULL,
	CONSTRAINT "price_pos" CHECK ("price_observation"."price_cents" > 0 and "price_observation"."price_cents" < 1000000)
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" text NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"brand" text,
	"ean" text,
	"package_quantity" numeric(14, 3) NOT NULL,
	"package_count" smallint DEFAULT 1 NOT NULL,
	"aisle" "aisle",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_qty_pos" CHECK ("product"."package_quantity" > 0 and "product"."package_count" >= 1),
	CONSTRAINT "product_ean_format" CHECK ("product"."ean" is null or "product"."ean" ~ '^[0-9]{8,14}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_feedback" (
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"rating" smallint,
	"favorite" boolean DEFAULT false NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_feedback_household_id_recipe_id_pk" PRIMARY KEY("household_id","recipe_id"),
	CONSTRAINT "feedback_rating" CHECK ("recipe_feedback"."rating" is null or "recipe_feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"ingredient_id" text,
	"raw_text" text NOT NULL,
	"quantity" numeric(14, 3),
	"unit_code" text,
	"note" text,
	"optional" boolean DEFAULT false NOT NULL,
	"fuzzy" boolean DEFAULT false NOT NULL,
	"substitutes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "recipe_ingredient_qty" CHECK ("recipe_ingredient"."quantity" is null or "recipe_ingredient"."quantity" > 0),
	CONSTRAINT "recipe_ingredient_fuzzy" CHECK ("recipe_ingredient"."fuzzy" or ("recipe_ingredient"."quantity" is not null and "recipe_ingredient"."unit_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"source_name" text,
	"license" text,
	"prep_minutes" smallint NOT NULL,
	"cook_minutes" smallint NOT NULL,
	"difficulty" smallint DEFAULT 1 NOT NULL,
	"equipment" text[] DEFAULT '{}'::text[] NOT NULL,
	"base_servings" smallint NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"meal_slots" "meal_slot"[] DEFAULT '{lunch,dinner}'::meal_slot[] NOT NULL,
	"cuisine" text,
	"leftover_days" smallint DEFAULT 0 NOT NULL,
	"freezes" boolean DEFAULT false NOT NULL,
	"status" "recipe_status" DEFAULT 'draft' NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"diets" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_minutes" CHECK ("recipe"."prep_minutes" >= 0 and "recipe"."cook_minutes" >= 0),
	CONSTRAINT "recipe_servings" CHECK ("recipe"."base_servings" between 1 and 50),
	CONSTRAINT "recipe_difficulty" CHECK ("recipe"."difficulty" between 1 and 3),
	CONSTRAINT "recipe_leftover" CHECK ("recipe"."leftover_days" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"previous_token_hash" "bytea",
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "shopping_list_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"ingredient_id" text,
	"label" text NOT NULL,
	"aisle" "aisle" NOT NULL,
	"base_unit" "base_unit",
	"quantity_needed" numeric(14, 3),
	"quantity_to_buy" numeric(14, 3),
	"surplus" numeric(14, 3),
	"packs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_cents" integer,
	"checked" boolean DEFAULT false NOT NULL,
	"purchased_quantity" numeric(14, 3),
	"actual_price_cents" integer,
	"is_extra" boolean DEFAULT false NOT NULL,
	"field_clocks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_item_price" CHECK ("shopping_list_item"."actual_price_cents" is null or "shopping_list_item"."actual_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shopping_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"meal_plan_id" uuid,
	"store_id" uuid,
	"estimated_cents" integer DEFAULT 0 NOT NULL,
	"total_is_partial" boolean DEFAULT false NOT NULL,
	"to_check" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_layout" (
	"store_id" uuid NOT NULL,
	"aisle" "aisle" NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "store_layout_store_id_aisle_pk" PRIMARY KEY("store_id","aisle")
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"chain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_op" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_conversion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" text NOT NULL,
	"unit_code" text NOT NULL,
	"to_base" numeric(14, 6) NOT NULL,
	CONSTRAINT "unit_conversion_pos" CHECK ("unit_conversion"."to_base" > 0)
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" "unit_kind" NOT NULL,
	"factor" numeric(14, 6),
	"label_fr" text NOT NULL,
	"label_en" text NOT NULL,
	CONSTRAINT "unit_factor" CHECK (("unit"."kind" in ('fuzzy','ingredient')) = ("unit"."factor" is null))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'fr-FR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_email_format" CHECK ("user"."email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
	CONSTRAINT "user_locale" CHECK ("user"."locale" in ('fr-FR','en-GB'))
);
--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invite" ADD CONSTRAINT "household_invite_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invite" ADD CONSTRAINT "household_invite_member_id_household_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household" ADD CONSTRAINT "household_default_store_id_store_id_fk" FOREIGN KEY ("default_store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_account" ADD CONSTRAINT "oauth_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_leftover_of_id_planned_meal_id_fk" FOREIGN KEY ("leftover_of_id") REFERENCES "public"."planned_meal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_feedback" ADD CONSTRAINT "recipe_feedback_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_feedback" ADD CONSTRAINT "recipe_feedback_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_unit_code_unit_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_list_id_shopping_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_layout" ADD CONSTRAINT "store_layout_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_op" ADD CONSTRAINT "sync_op_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_op" ADD CONSTRAINT "sync_op_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_unit_code_unit_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_household_idx" ON "audit_event" USING btree ("household_id","at");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_event" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "job_household_idx" ON "generation_job" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_household_user_uq" ON "household_member" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "member_household_idx" ON "household_member" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ingredient_name_idx" ON "ingredient" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "plan_household_week_uq" ON "meal_plan" USING btree ("household_id","week_start");--> statement-breakpoint
CREATE INDEX "pantry_household_idx" ON "pantry_item" USING btree ("household_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_meal_slot_uq" ON "planned_meal" USING btree ("meal_plan_id","day","slot");--> statement-breakpoint
CREATE INDEX "price_product_time_idx" ON "price_observation" USING btree ("product_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_ingredient_idx" ON "product" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_ean_uq" ON "product" USING btree ("ean") WHERE "product"."ean" is not null and "product"."household_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredient_pos_uq" ON "recipe_ingredient" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_ingredient_ing_idx" ON "recipe_ingredient" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_slug_uq" ON "recipe" USING btree (coalesce("household_id", '00000000-0000-0000-0000-000000000000'::uuid),"slug");--> statement-breakpoint
CREATE INDEX "recipe_household_idx" ON "recipe" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "recipe_status_idx" ON "recipe" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_prev_token_idx" ON "session" USING btree ("previous_token_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_item_list_idx" ON "shopping_list_item" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "shopping_household_idx" ON "shopping_list" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "store_layout_pos_uq" ON "store_layout" USING btree ("store_id","position");--> statement-breakpoint
CREATE INDEX "store_household_idx" ON "store" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "sync_op_household_idx" ON "sync_op" USING btree ("household_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_conversion_uq" ON "unit_conversion" USING btree ("ingredient_id","unit_code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_uq" ON "user" USING btree (lower("email"));