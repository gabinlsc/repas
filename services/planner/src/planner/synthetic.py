"""Générateur déterministe de snapshots synthétiques (tests de propriétés et benchmarks)."""

from __future__ import annotations

import random
from typing import Any, get_args

from planner.schemas import Allergen, Diet, PlanRequest, Slot

ALLERGENS: list[str] = list(get_args(Allergen))
DIETS: list[str] = list(get_args(Diet))
PROTEINS = ["boeuf", "volaille", "porc", "poisson", "oeuf", "legumineuse", "tofu", None]
CUISINES = ["française", "italienne", "asiatique", "méditerranéenne", "orientale", "mexicaine"]
SLOTS: list[Slot] = ["breakfast", "lunch", "dinner"]


def synthetic_request(
    *,
    seed: int = 1,
    n_recipes: int = 60,
    n_ingredients: int = 120,
    days: int = 7,
    slots: tuple[Slot, ...] = ("lunch", "dinner"),
    members: int = 3,
    member_allergens: list[list[str]] | None = None,
    member_diets: list[list[str]] | None = None,
    budget_cents: int | None = None,
    repeat_window_days: int = 7,
    time_limit_s: int = 10,
    max_prep: int = 60,
    locked: dict[tuple[int, str], str] | None = None,
    leftover_ratio: float = 0.2,
) -> PlanRequest:
    rng = random.Random(seed)
    ingredients: list[dict[str, Any]] = []
    for i in range(n_ingredients):
        size = rng.choice([25000, 50000, 100000, 600, 1200, 40000])
        ingredients.append(
            {
                "id": f"i{i}",
                "name": f"Ingrédient {i}",
                "pack_size_centi": size,
                "pack_price_cents": rng.randint(60, 600),
                "pantry": [],
            }
        )
    recipes: list[dict[str, Any]] = []
    for r in range(n_recipes):
        ings = rng.sample(range(n_ingredients), k=rng.randint(3, 9))
        allergens = sorted({a for _ in range(rng.choice([0, 0, 1, 1, 2])) for a in [rng.choice(ALLERGENS)]})
        diets = sorted(d for d in DIETS if rng.random() < 0.45)
        slot_choices: list[Slot] = ["breakfast"] if rng.random() < 0.15 else ["lunch", "dinner"]
        recipes.append(
            {
                "id": f"r{r:04d}",
                "title": f"Recette {r}",
                "total_minutes": rng.choice([10, 15, 20, 30, 45, 60, 90]),
                "equipment": rng.sample(["four", "plaques", "mixeur"], k=rng.randint(0, 2)),
                "allergens": allergens,
                "diets": diets,
                "slots": slot_choices,
                "protein": rng.choice(PROTEINS),
                "cuisine": rng.choice(CUISINES),
                "vegetables": [],
                "season_score": rng.randint(0, 100),
                "preference": rng.randint(-1, 3),
                "kcal_per_serving": rng.randint(250, 900),
                "leftover_days": rng.choice([2, 3]) if rng.random() < leftover_ratio else 0,
                "freezes": rng.random() < 0.1,
                "ingredients": [{"ingredient_id": f"i{i}", "qty_per_serving_centi": rng.randint(500, 20000)} for i in sorted(ings)],
            }
        )
    mems = [
        {
            "id": f"m{m}",
            "allergens": (member_allergens[m] if member_allergens and m < len(member_allergens) else []),
            "diets": (member_diets[m] if member_diets and m < len(member_diets) else []),
        }
        for m in range(members)
    ]
    day_list = [
        {
            "day": d,
            "max_prep_minutes": max_prep if d < 5 else max_prep * 2,
            "slots": [
                {
                    "slot": s,
                    "attendees": [m["id"] for m in mems],
                    "servings_centi": 100 * members,
                    "locked_recipe_id": (locked or {}).get((d, s)),
                }
                for s in slots
            ],
        }
        for d in range(days)
    ]
    return PlanRequest.model_validate(
        {
            "version": "1",
            "seed": seed,
            "time_limit_s": time_limit_s,
            "week_start": "2026-11-16",
            "repeat_window_days": repeat_window_days,
            "budget_cents": budget_cents,
            "equipment": ["four", "plaques", "mixeur"],
            "weights": {
                "cost": 5,
                "diversity": 5,
                "pantry": 6,
                "seasonality": 4,
                "distinct_ingredients": 3,
                "nutrition": 3,
                "preferences": 5,
            },
            "kcal_target_per_day": 2000 * members,
            "members": mems,
            "days": day_list,
            "recipes": recipes,
            "ingredients": ingredients,
        }
    )
