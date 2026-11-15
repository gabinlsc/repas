/**
 * Schéma relationnel complet. Principes :
 * - quantités métier en `numeric(14,3)` (exact) dans l'unité de base de l'ingrédient ;
 * - montants en centimes `integer` ;
 * - toute ressource d'un foyer porte `household_id` (contrôle d'accès systématique) ;
 * - contraintes CHECK pour les invariants simples, index pour les accès fréquents.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigserial, boolean, check, customType, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const baseUnit = pgEnum("base_unit", ["g", "ml", "piece"]);
export const unitKind = pgEnum("unit_kind", ["mass", "volume", "count", "fuzzy", "ingredient"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "guest"]);
export const recipeStatus = pgEnum("recipe_status", ["draft", "pending_review", "validated", "rejected"]);
export const mealSlot = pgEnum("meal_slot", ["breakfast", "lunch", "dinner", "snack"]);
export const planStatus = pgEnum("plan_status", ["draft", "generating", "ready", "failed", "archived"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);
export const expiryKind = pgEnum("expiry_kind", ["dlc", "ddm"]);
export const pantryLocation = pgEnum("pantry_location", ["fridge", "freezer", "cupboard"]);
export const priceSource = pgEnum("price_source", ["manual", "receipt", "open_prices", "seed"]);
export const aisle = pgEnum("aisle", [
  "fruits_legumes", "boulangerie", "boucherie", "poissonnerie", "charcuterie_traiteur", "cremerie", "fromagerie", "epicerie_salee",
  "feculents", "conserves", "condiments_epices", "epicerie_sucree", "monde", "surgeles", "boissons",
]);

/* ---------------------------------------------------------------- Identité */

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  locale: text("locale").notNull().default("fr-FR"),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("user_email_lower_uq").on(sql`lower(${t.email})`),
  check("user_email_format", sql`${t.email} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
  check("user_locale", sql`${t.locale} in ('fr-FR','en-GB')`),
]);

export const oauthAccounts = pgTable("oauth_account", {
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), check("oauth_provider", sql`${t.provider} in ('google','apple')`)]);

export const sessions = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull(),
  /** jeton précédent, encore accepté brièvement après rotation (requêtes concurrentes). */
  previousTokenHash: bytea("previous_token_hash"),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  userAgent: text("user_agent"),
}, (t) => [uniqueIndex("session_token_uq").on(t.tokenHash), index("session_prev_token_idx").on(t.previousTokenHash), index("session_user_idx").on(t.userId)]);

/* ---------------------------------------------------------------- Foyer */

export const households = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  weeklyBudgetCents: integer("weekly_budget_cents"),
  currency: text("currency").notNull().default("EUR"),
  /** créneaux planifiés par défaut, ex. ["lunch","dinner"]. */
  mealSlots: mealSlot("meal_slots").array().notNull().default(sql`'{dinner}'::meal_slot[]`),
  /** minutes de cuisine max par jour de la semaine (lundi → dimanche). */
  maxPrepMinutes: smallint("max_prep_minutes").array().notNull().default(sql`'{30,30,30,30,30,60,60}'::smallint[]`),
  repeatWindowDays: smallint("repeat_window_days").notNull().default(7),
  equipment: text("equipment").array().notNull().default(sql`'{plaques,four}'::text[]`),
  defaultStoreId: uuid("default_store_id").references((): AnyPgColumn => stores.id, { onDelete: "set null" }),
  weights: jsonb("weights").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  check("household_budget_nonneg", sql`${t.weeklyBudgetCents} is null or ${t.weeklyBudgetCents} >= 0`),
  check("household_repeat", sql`${t.repeatWindowDays} between 0 and 28`),
  check("household_prep_len", sql`array_length(${t.maxPrepMinutes}, 1) = 7`),
  check("household_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
]);

export const householdMembers = pgTable("household_member", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: memberRole("role").notNull().default("member"),
  portionFactor: numeric("portion_factor", { precision: 4, scale: 2 }).notNull().default("1.00"),
  /** allergènes, régimes, aversions, cibles : JSON chiffré AES-256-GCM (D-013). */
  sensitive: bytea("sensitive"),
  /** jours de présence aux repas (0 = lundi) ; par défaut tous. */
  presentDays: smallint("present_days").array().notNull().default(sql`'{0,1,2,3,4,5,6}'::smallint[]`),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("member_household_user_uq").on(t.householdId, t.userId),
  index("member_household_idx").on(t.householdId),
  check("member_portion", sql`${t.portionFactor} > 0 and ${t.portionFactor} <= 3`),
]);

export const householdInvites = pgTable("household_invite", {
  tokenHash: bytea("token_hash").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => householdMembers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------------- Référentiel */

export const ingredients = pgTable("ingredient", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  synonyms: text("synonyms").array().notNull().default(sql`'{}'::text[]`),
  aisle: aisle("aisle").notNull(),
  baseUnit: baseUnit("base_unit").notNull(),
  densityGPerMl: numeric("density_g_per_ml", { precision: 8, scale: 4 }),
  pieceWeightG: numeric("piece_weight_g", { precision: 10, scale: 3 }),
  /** valeurs pour 100 g : { kcal, protein, carbs, fat, fiber, sugar, salt } en chaînes décimales. */
  nutrition: jsonb("nutrition").$type<Record<string, string>>(),
  nutritionSource: text("nutrition_source"),
  ciqualCode: text("ciqual_code"),
  allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
  traits: text("traits").array().notNull().default(sql`'{}'::text[]`),
  seasonMonths: smallint("season_months").array().notNull().default(sql`'{}'::smallint[]`),
  proteinType: text("protein_type"),
  vegetableType: text("vegetable_type"),
  perishableDays: smallint("perishable_days"),
  /** variante fusionnée vers un ingrédient canonique (ex. oignon rouge → oignon). */
  canonicalId: text("canonical_id"),
}, (t) => [
  check("ingredient_id_slug", sql`${t.id} ~ '^[a-z0-9_]+$'`),
  check("ingredient_density_pos", sql`${t.densityGPerMl} is null or ${t.densityGPerMl} > 0`),
  check("ingredient_piece_pos", sql`${t.pieceWeightG} is null or ${t.pieceWeightG} > 0`),
  check(
    "ingredient_allergens_eu",
    sql`${t.allergens} <@ array['gluten','crustaces','oeufs','poissons','arachides','soja','lait','fruits_a_coque','celeri','moutarde','sesame','sulfites','lupin','mollusques']::text[]`,
  ),
  check("ingredient_traits", sql`${t.traits} <@ array['meat','pork','fish','seafood','dairy','lactose','egg','honey','alcohol','gelatin']::text[]`),
  check("ingredient_months", sql`${t.seasonMonths} <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]`),
  index("ingredient_name_idx").on(sql`lower(${t.name})`),
]);

export const units = pgTable("unit", {
  code: text("code").primaryKey(),
  kind: unitKind("kind").notNull(),
  factor: numeric("factor", { precision: 14, scale: 6 }),
  labelFr: text("label_fr").notNull(),
  labelEn: text("label_en").notNull(),
}, (t) => [check("unit_factor", sql`(${t.kind} in ('fuzzy','ingredient')) = (${t.factor} is null)`)]);

export const unitConversions = pgTable("unit_conversion", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  unitCode: text("unit_code").notNull().references(() => units.code),
  /** quantité équivalente dans l'unité de base de l'ingrédient. */
  toBase: numeric("to_base", { precision: 14, scale: 6 }).notNull(),
}, (t) => [uniqueIndex("unit_conversion_uq").on(t.ingredientId, t.unitCode), check("unit_conversion_pos", sql`${t.toBase} > 0`)]);

/* ---------------------------------------------------------------- Recettes */

export const recipes = pgTable("recipe", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** null = catalogue commun ; sinon recette privée du foyer. */
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  license: text("license"),
  prepMinutes: smallint("prep_minutes").notNull(),
  cookMinutes: smallint("cook_minutes").notNull(),
  difficulty: smallint("difficulty").notNull().default(1),
  equipment: text("equipment").array().notNull().default(sql`'{}'::text[]`),
  baseServings: smallint("base_servings").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  mealSlots: mealSlot("meal_slots").array().notNull().default(sql`'{lunch,dinner}'::meal_slot[]`),
  cuisine: text("cuisine"),
  leftoverDays: smallint("leftover_days").notNull().default(0),
  freezes: boolean("freezes").notNull().default(false),
  status: recipeStatus("status").notNull().default("draft"),
  /** allergènes recalculés par règles à chaque écriture (cache dénormalisé). */
  allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
  diets: text("diets").array().notNull().default(sql`'{}'::text[]`),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("recipe_slug_uq").on(sql`coalesce(${t.householdId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.slug),
  index("recipe_household_idx").on(t.householdId),
  index("recipe_status_idx").on(t.status),
  check("recipe_minutes", sql`${t.prepMinutes} >= 0 and ${t.cookMinutes} >= 0`),
  check("recipe_servings", sql`${t.baseServings} between 1 and 50`),
  check("recipe_difficulty", sql`${t.difficulty} between 1 and 3`),
  check("recipe_leftover", sql`${t.leftoverDays} between 0 and 7`),
]);

export const recipeIngredients = pgTable("recipe_ingredient", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  ingredientId: text("ingredient_id").references(() => ingredients.id),
  rawText: text("raw_text").notNull(),
  quantity: qty("quantity"),
  unitCode: text("unit_code").references(() => units.code),
  note: text("note"),
  optional: boolean("optional").notNull().default(false),
  fuzzy: boolean("fuzzy").notNull().default(false),
  /** [{ ingredientId, ratio }] : substituts autorisés. */
  substitutes: jsonb("substitutes").$type<Array<{ ingredientId: string; ratio: string }>>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [
  uniqueIndex("recipe_ingredient_pos_uq").on(t.recipeId, t.position),
  index("recipe_ingredient_ing_idx").on(t.ingredientId),
  check("recipe_ingredient_qty", sql`${t.quantity} is null or ${t.quantity} > 0`),
  check("recipe_ingredient_fuzzy", sql`${t.fuzzy} or (${t.quantity} is not null and ${t.unitCode} is not null)`),
]);

export const recipeFeedback = pgTable("recipe_feedback", {
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  rating: smallint("rating"),
  favorite: boolean("favorite").notNull().default(false),
  excluded: boolean("excluded").notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.householdId, t.recipeId] }), check("feedback_rating", sql`${t.rating} is null or ${t.rating} between 1 and 5`)]);

/* ---------------------------------------------------------------- Magasins et prix */

export const stores = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  chain: text("chain"),
  createdAt: createdAt(),
}, (t) => [index("store_household_idx").on(t.householdId)]);

export const storeLayouts = pgTable("store_layout", {
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  aisle: aisle("aisle").notNull(),
  position: smallint("position").notNull(),
}, (t) => [primaryKey({ columns: [t.storeId, t.aisle] }), uniqueIndex("store_layout_pos_uq").on(t.storeId, t.position)]);

export const products = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  ean: text("ean"),
  /** contenu total en unité de base de l'ingrédient (lot de 6 œufs = 6). */
  packageQuantity: qty("package_quantity").notNull(),
  packageCount: smallint("package_count").notNull().default(1),
  aisle: aisle("aisle"),
  createdAt: createdAt(),
}, (t) => [
  index("product_ingredient_idx").on(t.ingredientId),
  uniqueIndex("product_ean_uq").on(t.ean).where(sql`${t.ean} is not null and ${t.householdId} is null`),
  check("product_qty_pos", sql`${t.packageQuantity} > 0 and ${t.packageCount} >= 1`),
  check("product_ean_format", sql`${t.ean} is null or ${t.ean} ~ '^[0-9]{8,14}$'`),
]);

export const priceObservations = pgTable("price_observation", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  priceCents: integer("price_cents").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  source: priceSource("source").notNull(),
}, (t) => [index("price_product_time_idx").on(t.productId, t.observedAt), check("price_pos", sql`${t.priceCents} > 0 and ${t.priceCents} < 1000000`)]);

/* ---------------------------------------------------------------- Stock */

export const pantryItems = pgTable("pantry_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
  quantity: qty("quantity").notNull(),
  bestBefore: date("best_before"),
  expiryKind: expiryKind("expiry_kind").notNull().default("ddm"),
  location: pantryLocation("location").notNull().default("cupboard"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("pantry_household_idx").on(t.householdId, t.ingredientId), check("pantry_qty_nonneg", sql`${t.quantity} >= 0`)]);

/* ---------------------------------------------------------------- Plans */

export const mealPlans = pgTable("meal_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  status: planStatus("status").notNull().default("draft"),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  score: jsonb("score").$type<Record<string, unknown>>(),
  diagnostics: jsonb("diagnostics").$type<Array<{ code: string; message: string; params: Record<string, string | number> }>>().notNull().default(sql`'[]'::jsonb`),
  estimatedCostCents: integer("estimated_cost_cents"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("plan_household_week_uq").on(t.householdId, t.weekStart), check("plan_monday", sql`extract(isodow from ${t.weekStart}) = 1`)]);

export const plannedMeals = pgTable("planned_meal", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealPlanId: uuid("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  day: smallint("day").notNull(),
  slot: mealSlot("slot").notNull(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id),
  servings: numeric("servings", { precision: 6, scale: 2 }).notNull(),
  locked: boolean("locked").notNull().default(false),
  cookBig: boolean("cook_big").notNull().default(false),
  leftoverOfId: uuid("leftover_of_id").references((): AnyPgColumn => plannedMeals.id, { onDelete: "set null" }),
  cookedAt: timestamp("cooked_at", { withTimezone: true }),
  explanations: jsonb("explanations").$type<Array<{ code: string; params: Record<string, string | number> }>>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [
  uniqueIndex("planned_meal_slot_uq").on(t.mealPlanId, t.day, t.slot),
  check("planned_meal_day", sql`${t.day} between 0 and 6`),
  check("planned_meal_servings", sql`${t.servings} > 0`),
]);

export const generationJobs = pgTable("generation_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  mealPlanId: uuid("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("queued"),
  seed: integer("seed").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  createdAt: createdAt(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("job_household_idx").on(t.householdId, t.createdAt), check("job_seed", sql`${t.seed} >= 0`)]);

/* ---------------------------------------------------------------- Courses */

export const shoppingLists = pgTable("shopping_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  mealPlanId: uuid("meal_plan_id").references(() => mealPlans.id, { onDelete: "set null" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  estimatedCents: integer("estimated_cents").notNull().default(0),
  totalIsPartial: boolean("total_is_partial").notNull().default(false),
  toCheck: jsonb("to_check").$type<Array<{ label: string; reason: string; recipes: string[] }>>().notNull().default(sql`'[]'::jsonb`),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("shopping_household_idx").on(t.householdId, t.createdAt)]);

export const shoppingListItems = pgTable("shopping_list_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => shoppingLists.id, { onDelete: "cascade" }),
  ingredientId: text("ingredient_id").references(() => ingredients.id),
  label: text("label").notNull(),
  aisle: aisle("aisle").notNull(),
  baseUnit: baseUnit("base_unit"),
  quantityNeeded: qty("quantity_needed"),
  quantityToBuy: qty("quantity_to_buy"),
  surplus: qty("surplus"),
  /** [{ productId, name, count, size }] */
  packs: jsonb("packs").$type<Array<{ productId: string; name: string; count: number; size: string }>>().notNull().default(sql`'[]'::jsonb`),
  estimatedCents: integer("estimated_cents"),
  checked: boolean("checked").notNull().default(false),
  purchasedQuantity: qty("purchased_quantity"),
  actualPriceCents: integer("actual_price_cents"),
  isExtra: boolean("is_extra").notNull().default(false),
  /** horloges HLC par champ pour la fusion LWW (D-011). */
  fieldClocks: jsonb("field_clocks").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: updatedAt(),
}, (t) => [
  index("shopping_item_list_idx").on(t.listId),
  check("shopping_item_price", sql`${t.actualPriceCents} is null or ${t.actualPriceCents} >= 0`),
]);

export const syncOps = pgTable("sync_op", {
  id: uuid("id").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
}, (t) => [index("sync_op_household_idx").on(t.householdId, t.appliedAt)]);

/* ---------------------------------------------------------------- Audit */

export const auditEvents = pgTable("audit_event", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  householdId: uuid("household_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
}, (t) => [index("audit_household_idx").on(t.householdId, t.at), index("audit_user_idx").on(t.userId, t.at)]);

export const rateLimits = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
