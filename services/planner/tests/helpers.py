from __future__ import annotations

from typing import Any

from planner.schemas import PlanRequest

WEIGHTS = {"cost": 5, "diversity": 5, "pantry": 6, "seasonality": 4, "distinct_ingredients": 3, "nutrition": 3, "preferences": 5}


def recipe(rid: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": rid,
        "title": rid,
        "total_minutes": 20,
        "equipment": [],
        "allergens": [],
        "diets": ["vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free", "pork_free", "alcohol_free"],
        "slots": ["lunch", "dinner"],
        "protein": None,
        "cuisine": "française",
        "vegetables": [],
        "season_score": 50,
        "preference": 0,
        "kcal_per_serving": 600,
        "leftover_days": 0,
        "freezes": False,
        "ingredients": [{"ingredient_id": "farine", "qty_per_serving_centi": 10000}],
    }
    base.update(kw)
    return base


def request(recipes: list[dict[str, Any]], **kw: Any) -> PlanRequest:
    days = kw.pop("days", 3)
    slots = kw.pop("slots", ["dinner"])
    members = kw.pop("members", [{"id": "m1", "allergens": [], "diets": []}])
    locked: dict[tuple[int, str], str] = kw.pop("locked", {})
    max_prep = kw.pop("max_prep", 60)
    ingredients = kw.pop(
        "ingredients",
        [
            {"id": "farine", "name": "Farine", "pack_size_centi": 100000, "pack_price_cents": 120, "pantry": []},
            {"id": "oeuf", "name": "Œuf", "pack_size_centi": 600, "pack_price_cents": 199, "pantry": []},
            {"id": "poulet", "name": "Poulet", "pack_size_centi": 50000, "pack_price_cents": 690, "pantry": []},
        ],
    )
    body: dict[str, Any] = {
        "version": "1",
        "seed": 7,
        "time_limit_s": 3,
        "week_start": "2026-11-16",
        "repeat_window_days": 0,
        "budget_cents": None,
        "equipment": ["four", "plaques"],
        "weights": WEIGHTS,
        "kcal_target_per_day": None,
        "members": members,
        "days": [
            {
                "day": d,
                "max_prep_minutes": max_prep,
                "slots": [
                    {
                        "slot": s,
                        "attendees": [m["id"] for m in members],
                        "servings_centi": 100 * len(members),
                        "locked_recipe_id": locked.get((d, s)),
                    }
                    for s in slots
                ],
            }
            for d in range(days)
        ],
        "recipes": recipes,
        "ingredients": ingredients,
    }
    body.update(kw)
    return PlanRequest.model_validate(body)
