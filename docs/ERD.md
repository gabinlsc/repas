# Modèle de données (ERD)

Source de vérité : `packages/db/src/schema.ts` → migration SQL `packages/db/drizzle/0000_init.sql` (38 clés étrangères, 32 contraintes CHECK).
Quantités : `numeric(14,3)` dans l'unité de base de l'ingrédient. Montants : centimes `integer`.

```mermaid
erDiagram
  user ||--o{ session : "ouvre"
  user ||--o{ oauth_account : "lie"
  user ||--o{ household_member : "est"
  household ||--o{ household_member : "compte"
  household ||--o{ household_invite : "invite"
  household ||--o{ recipe : "possède (privées)"
  household ||--o{ recipe_feedback : "note"
  household ||--o{ store : "personnalise"
  household ||--o{ pantry_item : "stocke"
  household ||--o{ meal_plan : "planifie"
  household ||--o{ generation_job : "lance"
  household ||--o{ shopping_list : "fait"
  household ||--o{ sync_op : "synchronise"
  household }o--o| store : "magasin par défaut"
  ingredient ||--o{ unit_conversion : "convertit"
  unit ||--o{ unit_conversion : ""
  ingredient ||--o{ recipe_ingredient : "compose"
  unit ||--o{ recipe_ingredient : ""
  recipe ||--o{ recipe_ingredient : "contient"
  recipe ||--o{ recipe_feedback : ""
  ingredient ||--o{ product : "se vend en"
  product ||--o{ price_observation : "a un prix"
  store ||--o{ price_observation : "observé à"
  store ||--o{ store_layout : "ordonne"
  ingredient ||--o{ pantry_item : ""
  meal_plan ||--o{ planned_meal : "contient"
  recipe ||--o{ planned_meal : "servie"
  planned_meal |o--o{ planned_meal : "restes de"
  meal_plan ||--o{ generation_job : "généré par"
  meal_plan |o--o{ shopping_list : "alimente"
  shopping_list ||--o{ shopping_list_item : "contient"
  ingredient |o--o{ shopping_list_item : ""

  user { uuid id PK; text email UK "lower()"; text password_hash "argon2id"; text display_name; text locale; timestamptz deleted_at }
  session { uuid id PK; uuid user_id FK; bytea token_hash UK "sha256"; bytea previous_token_hash; timestamptz rotated_at; timestamptz expires_at }
  oauth_account { text provider PK; text provider_user_id PK; uuid user_id FK }
  household { uuid id PK; text name; int weekly_budget_cents "CHECK >= 0"; meal_slot[] meal_slots; smallint[] max_prep_minutes "7 valeurs"; smallint repeat_window_days "0..28"; text[] equipment; uuid default_store_id FK; jsonb weights }
  household_member { uuid id PK; uuid household_id FK; uuid user_id FK; text name; member_role role; numeric portion_factor "0 < f <= 3"; bytea sensitive "AES-256-GCM"; smallint[] present_days }
  household_invite { bytea token_hash PK; uuid household_id FK; uuid member_id FK; timestamptz expires_at }
  ingredient { text id PK "slug"; text name; text[] synonyms; aisle aisle; base_unit base_unit; numeric density_g_per_ml; numeric piece_weight_g; jsonb nutrition "pour 100 g"; text ciqual_code; text[] allergens "14 UE"; text[] traits; smallint[] season_months; text canonical_id }
  unit { text code PK; unit_kind kind; numeric factor }
  unit_conversion { uuid id PK; text ingredient_id FK; text unit_code FK; numeric to_base }
  recipe { uuid id PK; uuid household_id FK "null = catalogue"; text slug UK; text title; smallint prep_minutes; smallint cook_minutes; smallint difficulty; text[] equipment; smallint base_servings; jsonb steps; text[] tags; meal_slot[] meal_slots; smallint leftover_days; bool freezes; recipe_status status; text[] allergens "recalculés"; text[] diets }
  recipe_ingredient { uuid id PK; uuid recipe_id FK; smallint position UK; text ingredient_id FK; text raw_text; numeric quantity; text unit_code FK; bool optional; bool fuzzy; jsonb substitutes }
  recipe_feedback { uuid household_id PK; uuid recipe_id PK; smallint rating; bool favorite; bool excluded }
  store { uuid id PK; uuid household_id FK; text name; text chain }
  store_layout { uuid store_id PK; aisle aisle PK; smallint position UK }
  product { uuid id PK; text ingredient_id FK; text name; text ean UK; numeric package_quantity; smallint package_count; aisle aisle }
  price_observation { uuid id PK; uuid product_id FK; uuid store_id FK; int price_cents; timestamptz observed_at; price_source source }
  pantry_item { uuid id PK; uuid household_id FK; text ingredient_id FK; numeric quantity; date best_before; expiry_kind expiry_kind; pantry_location location }
  meal_plan { uuid id PK; uuid household_id FK; date week_start UK "lundi"; plan_status status; jsonb params; jsonb score; jsonb diagnostics; int estimated_cost_cents }
  planned_meal { uuid id PK; uuid meal_plan_id FK; smallint day UK; meal_slot slot UK; uuid recipe_id FK; numeric servings; bool locked; bool cook_big; uuid leftover_of_id FK; timestamptz cooked_at; jsonb explanations }
  generation_job { uuid id PK; uuid household_id FK; uuid meal_plan_id FK; job_status status; int seed; jsonb snapshot; jsonb result; int duration_ms }
  shopping_list { uuid id PK; uuid household_id FK; uuid meal_plan_id FK; uuid store_id FK; int estimated_cents; jsonb to_check }
  shopping_list_item { uuid id PK; uuid list_id FK; text ingredient_id FK; text label; aisle aisle; numeric quantity_needed; numeric quantity_to_buy; numeric surplus; jsonb packs; bool checked; numeric purchased_quantity; int actual_price_cents; jsonb field_clocks "HLC" }
  sync_op { uuid id PK "clé d'idempotence"; uuid household_id FK; jsonb result }
  audit_event { bigserial id PK; uuid household_id; uuid user_id; text action; text entity; jsonb meta }
```

## Invariants notables
- `recipe.allergens` / `recipe.diets` ne sont jamais saisis : ils sont recalculés depuis les ingrédients (règles `packages/domain/src/dietary.ts`).
- `meal_plan.week_start` est toujours un lundi (CHECK `isodow = 1`) ; un plan par foyer et par semaine.
- `recipe_ingredient` non flou ⇒ quantité **et** unité renseignées (CHECK).
- `ingredient.allergens` ⊂ 14 allergènes UE (CHECK).
