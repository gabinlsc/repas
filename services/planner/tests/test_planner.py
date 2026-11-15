from __future__ import annotations

from planner.service import plan
from planner.synthetic import synthetic_request
from tests.helpers import recipe, request

ALL_DIETS = ["vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free", "pork_free", "alcohol_free"]


def test_feasible_plan_one_meal_per_slot() -> None:
    req = request([recipe(f"r{i}") for i in range(6)], days=3, slots=["lunch", "dinner"], repeat_window_days=7)
    res = plan(req, workers=4)
    assert res.status in ("optimal", "feasible")
    assert sorted((m.day, m.slot) for m in res.meals) == sorted((d, s) for d in range(3) for s in ["lunch", "dinner"])
    assert len({m.recipe_id for m in res.meals}) == 6  # aucune répétition sur la fenêtre
    assert res.score is not None and res.estimated_cost_cents is not None
    assert all(m.explanations for m in res.meals)


def test_hard_exclusions_time_equipment_slot() -> None:
    req = request(
        [
            recipe("long", total_minutes=120, preference=3),
            recipe("needs_wok", equipment=["wok"], preference=3),
            recipe("breakfast_only", slots=["breakfast"], preference=3),
            recipe("ok"),
        ],
        days=2,
        max_prep=30,
    )
    res = plan(req, workers=4)
    assert {m.recipe_id for m in res.meals} == {"ok"}


def test_allergen_and_diet_never_served() -> None:
    members = [{"id": "m1", "allergens": ["oeufs"], "diets": []}, {"id": "m2", "allergens": [], "diets": ["vegetarian"]}]
    req = request(
        [
            recipe("omelette", allergens=["oeufs"], preference=3),
            recipe("poulet", diets=["gluten_free"], preference=3),
            recipe("legumes"),
            recipe("pates"),
        ],
        members=members,
        days=4,
    )
    res = plan(req, workers=4)
    assert {m.recipe_id for m in res.meals} <= {"legumes", "pates"}


def test_locked_meals_are_kept_even_outside_time_limit() -> None:
    req = request([recipe("a"), recipe("b", total_minutes=200)], days=3, locked={(1, "dinner"): "b"}, max_prep=30)
    res = plan(req, workers=4)
    by_day = {m.day: m for m in res.meals}
    assert by_day[1].recipe_id == "b"
    assert any(e.code == "locked" for e in by_day[1].explanations)


def test_partial_regeneration_keeps_locked() -> None:
    first = plan(request([recipe(f"r{i}", preference=i % 3) for i in range(8)], days=4, repeat_window_days=4), workers=4)
    locked = {(m.day, m.slot): m.recipe_id for m in first.meals if m.day != 2}
    again = plan(request([recipe(f"r{i}", preference=i % 3) for i in range(8)], days=4, repeat_window_days=4, locked=locked), workers=4)
    for m in again.meals:
        if m.day != 2:
            assert m.recipe_id == locked[(m.day, m.slot)]


def test_infeasible_no_candidate_lists_reason() -> None:
    members = [{"id": "m1", "allergens": ["gluten"], "diets": []}]
    res = plan(request([recipe("a", allergens=["gluten"])], members=members), workers=4)
    assert res.status == "infeasible"
    assert res.diagnostics[0].code == "no_candidates"
    assert res.diagnostics[0].params["reason"] == "allergens"
    assert "gluten" in str(res.diagnostics[0].params["allergens"])
    res = plan(request([recipe("a", total_minutes=90)], max_prep=10), workers=4)
    assert res.diagnostics[0].params["reason"] == "time"
    res = plan(request([recipe("a", diets=[])], members=[{"id": "m1", "allergens": [], "diets": ["vegan"]}]), workers=4)
    assert res.diagnostics[0].params["reason"] == "diets"


def test_locked_unsafe_is_rejected() -> None:
    members = [{"id": "m1", "allergens": ["oeufs"], "diets": []}]
    res = plan(request([recipe("om", allergens=["oeufs"]), recipe("ok")], members=members, locked={(0, "dinner"): "om"}), workers=4)
    assert res.status == "infeasible"
    assert res.diagnostics[0].code == "locked_unsafe"


def test_budget_too_low_reports_minimum() -> None:
    res = plan(request([recipe("a"), recipe("b"), recipe("c")], days=3, budget_cents=100), workers=4)
    assert res.status == "infeasible"
    d = next(d for d in res.diagnostics if d.code == "budget_too_low")
    assert int(d.params["minimum_cents"]) > 100
    assert "€" in d.message
    ok = plan(request([recipe("a"), recipe("b"), recipe("c")], days=3, budget_cents=int(d.params["minimum_cents"])), workers=4)
    assert ok.status in ("optimal", "feasible")


def test_repeat_window_infeasible() -> None:
    res = plan(request([recipe("a"), recipe("b")], days=4, repeat_window_days=7), workers=4)
    assert res.status == "infeasible"
    assert any(d.code == "repeat_window" for d in res.diagnostics)


def test_pantry_is_used_and_perishable_consumed_before_expiry() -> None:
    ingredients = [
        {"id": "farine", "name": "Farine", "pack_size_centi": 100000, "pack_price_cents": 120, "pantry": []},
        {
            "id": "poulet",
            "name": "Poulet",
            "pack_size_centi": 50000,
            "pack_price_cents": 690,
            "pantry": [{"qty_centi": 20000, "expiry_day": 1, "must_use": True}],
        },
    ]
    recipes = [
        recipe("pates", preference=3),
        recipe("poulet_roti", diets=[], ingredients=[{"ingredient_id": "poulet", "qty_per_serving_centi": 15000}]),
    ]
    res = plan(request(recipes, days=4, ingredients=ingredients), workers=4)
    assert res.status in ("optimal", "feasible")
    early = [m for m in res.meals if m.day <= 1 and m.recipe_id == "poulet_roti"]
    assert len(early) >= 2  # 200 g à consommer, 150 g par repas
    assert any(e.code == "uses_pantry" for m in early for e in m.explanations)


def test_perishable_impossible_is_diagnosed() -> None:
    ingredients = [
        {"id": "farine", "name": "Farine", "pack_size_centi": 100000, "pack_price_cents": 120, "pantry": []},
        {
            "id": "poulet",
            "name": "Poulet",
            "pack_size_centi": None,
            "pack_price_cents": None,
            "pantry": [{"qty_centi": 100, "expiry_day": 1, "must_use": True}],
        },
    ]
    res = plan(request([recipe("a")], ingredients=ingredients), workers=4)
    assert res.status == "infeasible"
    assert any(d.code == "perishable" for d in res.diagnostics)


def test_leftovers_feed_later_slot() -> None:
    # Jour 1 : 5 minutes seulement ; seule une recette « batch » cuisinée le jour 0 peut servir.
    req = request(
        [recipe("batch", total_minutes=40, leftover_days=2), recipe("slow", total_minutes=40)],
        days=2,
        max_prep=60,
    )
    body = req.model_dump()
    body["days"][1]["max_prep_minutes"] = 5
    res = plan(type(req).model_validate(body), workers=4)
    assert res.status in ("optimal", "feasible")
    d0 = next(m for m in res.meals if m.day == 0)
    d1 = next(m for m in res.meals if m.day == 1)
    assert d0.recipe_id == "batch" and d0.cook_big
    assert d1.leftover_of is not None and d1.leftover_of.day == 0
    assert any(e.code == "batch_cook" for e in d0.explanations)


def test_determinism_same_seed_same_plan() -> None:
    req = synthetic_request(n_recipes=80, n_ingredients=60, time_limit_s=2)
    a = plan(req, workers=4)
    b = plan(req, workers=4)
    assert a.deterministic and b.deterministic
    assert [(m.day, m.slot, m.recipe_id, m.cook_big) for m in a.meals] == [(m.day, m.slot, m.recipe_id, m.cook_big) for m in b.meals]
    assert a.score == b.score


def test_nutrition_and_partial_prices() -> None:
    ingredients: list[dict[str, object]] = [
        {"id": "farine", "name": "Farine", "pack_size_centi": None, "pack_price_cents": None, "pantry": []}
    ]
    res = plan(
        request(
            [recipe("a", kcal_per_serving=700), recipe("b", kcal_per_serving=300)],
            days=2,
            ingredients=ingredients,
            kcal_target_per_day=2000,
        ),
        workers=4,
    )
    assert res.score is not None
    assert any(d.code == "partial_prices" for d in res.diagnostics)
    assert all(any(e.code == "kcal" for e in m.explanations) for m in res.meals)
