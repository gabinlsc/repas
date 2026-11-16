# API

## tRPC (web ↔ serveur) — `/api/trpc`
Typage de bout en bout (`AppRouter`, `apps/web/src/server/routers/_app.ts`), transformateur superjson, validation Zod. Toute mutation exige l'en-tête `Origin` de l'application. Les procédures « foyer » résolvent le foyer de l'utilisateur côté serveur.

| Routeur | Procédures |
|---|---|
| `auth` | `register`, `login`, `logout`, `me` |
| `household` | `get`, `update`, `completeOnboarding`, `addMember`, `updateMember`, `removeMember` |
| `recipes` | `list`, `get`, `ingredients`, `parseLine`, `importUrl`, `importText`, `create`, `update`, `remove`, `feedback`, `units`, `ingredientById` |
| `plan` | `current`, `generate`, `regenerateSlot`, `job`, `setLocked`, `move`, `replace`, `remove`, `restore`, `markCooked` |
| `shopping` | `generate`, `latest`, `get`, `sync` (file d'opérations idempotentes, LWW + HLC), `close`, `markdown`, `surplus` |
| `pantry` | `list`, `add`, `update`, `remove`, `restore` |
| `budget` | `summary`, `products`, `priceHistory`, `addPrice` |
| `stores` | `list`, `create`, `setLayout` |
| `account` | `export` (RGPD), `delete`, `logoutEverywhere` |
| `products` | `lookupEan` (catalogue local puis Open Food Facts) |

Erreurs : codes tRPC standard + `data.appCode` (codes métier stables, ex. `RATE_LIMITED`, `UNCONVERTIBLE_UNIT`) pour l'i18n.

### Synchronisation hors ligne (`shopping.sync`)
```json
{ "ops": [
  { "id": "uuid (clé d'idempotence)", "type": "patch", "itemId": "uuid", "patch": { "checked": true, "actualPriceCents": 349 }, "clock": "000001794811022134:000000:node" },
  { "id": "uuid", "type": "add", "itemId": "uuid", "listId": "uuid", "label": "Papier toilette", "aisle": "epicerie_salee", "clock": "…" },
  { "id": "uuid", "type": "delete", "itemId": "uuid", "clock": "…" }
] }
```
Réponse : `{ "results": [{ "id": "…", "status": "applied" | "duplicate" | "rejected" }] }`.

## Autres routes HTTP
| Route | Description |
|---|---|
| `GET /api/health` | santé (base, solveur) |
| `GET /api/metrics` | Prometheus (jeton `METRICS_TOKEN` si défini) |
| `GET /api/events` | SSE : notifications de changement de la liste du foyer |
| `GET /api/ics?week=AAAA-MM-JJ` | export iCalendar des repas |

## Solveur — `POST /v1/plan` (service Python, OpenAPI sur `/openapi.json`, `/docs`)
Contrat versionné, miroir exact de `packages/domain/src/planner.ts` (Zod) et `services/planner/src/planner/schemas.py` (Pydantic, `extra="forbid"`). Quantités en centi-unités de base entières, montants en centimes.

Entrée (extrait) :
```json
{ "version": "1", "seed": 42, "time_limit_s": 10, "week_start": "2026-11-16", "repeat_window_days": 7, "budget_cents": 8000,
  "equipment": ["four", "plaques"], "weights": { "cost": 5, "diversity": 5, "pantry": 6, "seasonality": 4, "distinct_ingredients": 3, "nutrition": 3, "preferences": 5 },
  "kcal_target_per_day": 4000, "members": [{ "id": "m1", "allergens": ["oeufs"], "diets": ["vegetarian"] }],
  "days": [{ "day": 0, "max_prep_minutes": 30, "slots": [{ "slot": "dinner", "attendees": ["m1"], "servings_centi": 100, "locked_recipe_id": null }] }],
  "recipes": [{ "id": "…", "total_minutes": 25, "allergens": [], "diets": ["vegetarian"], "slots": ["dinner"], "ingredients": [{ "ingredient_id": "riz", "qty_per_serving_centi": 7500 }], "…": "…" }],
  "ingredients": [{ "id": "riz", "name": "Riz", "pack_size_centi": 100000, "pack_price_cents": 219, "pantry": [{ "qty_centi": 25000, "expiry_day": null, "must_use": false }] }] }
```
Sortie : `status` (`optimal`/`feasible`/`infeasible`/`invalid`), `deterministic`, `meals[]` (avec `cook_big`, `leftover_of`, `explanations[]` codés), `score`, `estimated_cost_cents`, `diagnostics[]` (`no_candidates`, `locked_unsafe`, `budget_too_low` avec `minimum_cents`, `repeat_window`, `perishable`, `timeout`, `partial_prices`).
