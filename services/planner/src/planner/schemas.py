"""Contrat versionné /v1/plan. Miroir exact de `packages/domain/src/planner.ts`.

Toutes les quantités sont des entiers en centi-unités de base (0,01 g / ml / pièce) et
tous les montants en centimes : CP-SAT ne manipule que des entiers, et cela évite toute
ambiguïté d'arrondi entre TypeScript et Python.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slot = Literal["breakfast", "lunch", "dinner", "snack"]
Allergen = Literal[
    "gluten",
    "crustaces",
    "oeufs",
    "poissons",
    "arachides",
    "soja",
    "lait",
    "fruits_a_coque",
    "celeri",
    "moutarde",
    "sesame",
    "sulfites",
    "lupin",
    "mollusques",
]
Diet = Literal["vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free", "pork_free", "alcohol_free"]

NonNegInt = Annotated[int, Field(ge=0)]
Weight = Annotated[int, Field(ge=0, le=10)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Weights(Strict):
    cost: Weight
    diversity: Weight
    pantry: Weight
    seasonality: Weight
    distinct_ingredients: Weight
    nutrition: Weight
    preferences: Weight


class Member(Strict):
    id: str
    allergens: list[Allergen]
    diets: list[Diet]


class SlotRequest(Strict):
    slot: Slot
    attendees: Annotated[list[str], Field(min_length=1)]
    servings_centi: Annotated[int, Field(ge=1)]
    locked_recipe_id: str | None


class Day(Strict):
    day: Annotated[int, Field(ge=0, le=13)]
    max_prep_minutes: NonNegInt
    slots: list[SlotRequest]


class RecipeIngredient(Strict):
    ingredient_id: str
    qty_per_serving_centi: NonNegInt


class Recipe(Strict):
    id: str
    title: str
    total_minutes: NonNegInt
    equipment: list[str]
    allergens: list[Allergen]
    diets: list[Diet]
    slots: list[Slot]
    protein: str | None
    cuisine: str | None
    vegetables: list[str]
    season_score: Annotated[int, Field(ge=0, le=100)]
    preference: Annotated[int, Field(ge=-3, le=3)]
    kcal_per_serving: NonNegInt
    leftover_days: Annotated[int, Field(ge=0, le=7)]
    freezes: bool
    ingredients: list[RecipeIngredient]


class PantryLot(Strict):
    qty_centi: NonNegInt
    expiry_day: int | None
    must_use: bool


class Ingredient(Strict):
    id: str
    name: str
    pack_size_centi: Annotated[int, Field(ge=1)] | None
    pack_price_cents: NonNegInt | None
    pantry: list[PantryLot]


class PlanRequest(Strict):
    version: Literal["1"]
    seed: Annotated[int, Field(ge=0, le=2_147_483_647)]
    time_limit_s: Annotated[int, Field(ge=1, le=60)] = 10
    week_start: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    repeat_window_days: Annotated[int, Field(ge=0, le=28)]
    budget_cents: NonNegInt | None
    equipment: list[str]
    weights: Weights
    kcal_target_per_day: NonNegInt | None
    members: list[Member]
    days: list[Day]
    recipes: list[Recipe]
    ingredients: list[Ingredient]

    @model_validator(mode="after")
    def _references(self) -> PlanRequest:
        """Refuse les références pendantes : un snapshot incohérent est une erreur du client."""
        member_ids = {m.id for m in self.members}
        recipe_ids = {r.id for r in self.recipes}
        ingredient_ids = {i.id for i in self.ingredients}
        if len(recipe_ids) != len(self.recipes):
            raise ValueError("identifiants de recettes dupliqués")
        seen: set[tuple[int, str]] = set()
        for d in self.days:
            for s in d.slots:
                if (d.day, s.slot) in seen:
                    raise ValueError(f"créneau dupliqué : jour {d.day} {s.slot}")
                seen.add((d.day, s.slot))
                unknown = set(s.attendees) - member_ids
                if unknown:
                    raise ValueError(f"convive inconnu : {sorted(unknown)}")
                if s.locked_recipe_id is not None and s.locked_recipe_id not in recipe_ids:
                    raise ValueError(f"recette verrouillée inconnue : {s.locked_recipe_id}")
        for r in self.recipes:
            for ri in r.ingredients:
                if ri.ingredient_id not in ingredient_ids:
                    raise ValueError(f"ingrédient inconnu : {ri.ingredient_id}")
        return self


Params = dict[str, str | int]


class Explanation(Strict):
    code: str
    params: Params


class LeftoverRef(Strict):
    day: int
    slot: Slot


class Meal(Strict):
    day: int
    slot: Slot
    recipe_id: str
    servings_centi: int
    cook_big: bool
    leftover_of: LeftoverRef | None
    explanations: list[Explanation]


class Diagnostic(Strict):
    code: str
    message: str
    params: Params


class Score(Strict):
    objective: int
    cost_cents: int
    distinct_ingredients: int
    pantry_used_centi: int
    seasonality_avg: float
    distinct_proteins: int
    distinct_cuisines: int
    preference_total: int
    kcal_gap_per_day: int


class PlanResponse(Strict):
    version: Literal["1"] = "1"
    status: Literal["optimal", "feasible", "infeasible", "invalid"]
    deterministic: bool
    wall_time_ms: int
    estimated_cost_cents: int | None
    score: Score | None
    meals: list[Meal]
    diagnostics: list[Diagnostic]
