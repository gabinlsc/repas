"""Propriété centrale : aucun plan ne sert un allergène (ou ne viole un régime) d'un convive présent.

Deux niveaux :
- structurel (10 000 cas) : le modèle ne crée *aucune* variable pour un couple recette/créneau
  dangereux — donc aucune solution, quelle qu'elle soit, ne peut le contenir ;
- bout en bout (échantillon) : le plan résolu respecte la règle.
"""

from __future__ import annotations

import os

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from planner.candidates import is_safe, slot_infos
from planner.model import build
from planner.service import plan
from planner.synthetic import ALLERGENS, DIETS, synthetic_request

STRUCTURAL_CASES = int(os.environ.get("PROPERTY_CASES", "10000"))
E2E_CASES = int(os.environ.get("PROPERTY_E2E_CASES", "40"))

allergen_sets = st.lists(st.lists(st.sampled_from(ALLERGENS), max_size=3, unique=True), min_size=1, max_size=4)
diet_sets = st.lists(st.lists(st.sampled_from(DIETS), max_size=2, unique=True), min_size=1, max_size=4)


@settings(max_examples=STRUCTURAL_CASES, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(seed=st.integers(0, 10_000), allergens=allergen_sets, diets=diet_sets)
def test_no_variable_for_unsafe_recipe(seed: int, allergens: list[list[str]], diets: list[list[str]]) -> None:
    req = synthetic_request(
        seed=seed, n_recipes=12, n_ingredients=15, days=2, members=4, member_allergens=allergens, member_diets=diets, leftover_ratio=0.3
    )
    mdl = build(req)
    infos = {i.key: i for i in slot_infos(req)}
    recipes = {r.id: r for r in req.recipes}
    for rid, t in list(mdl.x) + list(mdl.lo):
        assert is_safe(recipes[rid], infos[t]), (rid, t)


@settings(max_examples=E2E_CASES, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(seed=st.integers(0, 10_000), allergens=allergen_sets, diets=diet_sets)
def test_solved_plan_is_safe(seed: int, allergens: list[list[str]], diets: list[list[str]]) -> None:
    req = synthetic_request(
        seed=seed, n_recipes=25, n_ingredients=20, days=3, members=4, member_allergens=allergens, member_diets=diets, time_limit_s=1
    )
    res = plan(req, workers=2)
    recipes = {r.id: r for r in req.recipes}
    members = {m.id: m for m in req.members}
    for meal in res.meals:
        r = recipes[meal.recipe_id]
        for m in members.values():
            assert not set(r.allergens) & set(m.allergens)
            assert set(m.diets) <= set(r.diets)
