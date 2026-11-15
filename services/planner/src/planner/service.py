"""Orchestration : pré-analyse, résolution, diagnostic, extraction et explications."""

from __future__ import annotations

from fractions import Fraction

from planner.candidates import SLOT_ORDER, SlotInfo, SlotKey, filter_candidates, is_safe, slot_infos
from planner.model import KCAL_SHARE, Model, Solved, build, coef, solve
from planner.schemas import Diagnostic, Explanation, LeftoverRef, Meal, PlanRequest, PlanResponse, Score

DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
SLOT_NAMES = {"breakfast": "petit-déjeuner", "lunch": "déjeuner", "dinner": "dîner", "snack": "collation"}
REASONS = {
    "slot_type": "aucune recette n'est prévue pour ce type de repas",
    "allergens": "toutes les recettes contiennent un allergène d'un convive",
    "diets": "aucune recette ne respecte le régime des convives",
    "equipment": "le matériel disponible ne permet aucune recette",
    "time": "aucune recette ne tient dans le temps de cuisine du jour",
}


def _day(d: int) -> str:
    return DAY_NAMES[d % 7] + (f" (semaine {d // 7 + 1})" if d >= 7 else "")


def pre_analysis(req: PlanRequest) -> list[Diagnostic]:
    """Infaisabilités détectables sans solveur, avec un message actionnable."""
    out: list[Diagnostic] = []
    recipes = {r.id: r for r in req.recipes}
    infos = slot_infos(req)
    fresh = {i.key: filter_candidates(req, i).candidates if i.locked_recipe_id is None else [recipes[i.locked_recipe_id]] for i in infos}

    def leftover_possible(info: SlotInfo) -> bool:
        # Un créneau sans recette réalisable peut être servi par les restes d'un plat batch.
        for src in infos:
            if not (info.day - src.day > 0) or src.servings_centi < info.servings_centi:
                continue
            for r in fresh[src.key]:
                window = 7 if r.freezes else r.leftover_days
                if r.leftover_days > 0 and info.day - src.day <= window and info.slot in r.slots and is_safe(r, info):
                    return True
        return False

    for info in infos:
        where = f"{_day(info.day)} {SLOT_NAMES[info.slot]}"
        if info.locked_recipe_id is not None:
            r = recipes[info.locked_recipe_id]
            if not is_safe(r, info):
                bad = sorted(set(r.allergens) & info.allergens)
                out.append(
                    Diagnostic(
                        code="locked_unsafe",
                        message=f"« {r.title} » verrouillée le {where} ne convient pas à un convive "
                        f"({', '.join(bad) if bad else 'régime'}).",
                        params={"day": info.day, "slot": info.slot, "recipe": r.id},
                    )
                )
            continue
        f = filter_candidates(req, info)
        if not f.candidates and not leftover_possible(info):
            reason = f.eliminated_by or "slot_type"
            params: dict[str, str | int] = {"day": info.day, "slot": info.slot, "reason": reason}
            if reason == "allergens":
                params["allergens"] = ",".join(sorted(info.allergens))
            if reason == "time":
                params["max_minutes"] = info.max_minutes
            out.append(Diagnostic(code="no_candidates", message=f"{where} : {REASONS[reason]}.", params=params))
    return out


def plan(req: PlanRequest, workers: int = 8) -> PlanResponse:
    pre = pre_analysis(req)
    if pre:
        return PlanResponse(
            status="infeasible", deterministic=True, wall_time_ms=0, estimated_cost_cents=None, score=None, meals=[], diagnostics=pre
        )
    mdl = build(req)
    res = solve(mdl, req.seed, req.time_limit_s, workers)
    if res.status in ("optimal", "feasible"):
        return _response(mdl, res, [])
    if res.status == "unknown":
        # Temps écoulé sans solution : on tente la version relâchée pour au moins diagnostiquer.
        pass
    relaxed = build(req, relaxed=True)
    rres = solve(relaxed, req.seed, req.time_limit_s, workers)
    if rres.status not in ("optimal", "feasible"):
        return PlanResponse(
            status="infeasible",
            deterministic=res.deterministic,
            wall_time_ms=res.wall_ms + rres.wall_ms,
            estimated_cost_cents=None,
            score=None,
            meals=[],
            diagnostics=[
                Diagnostic(
                    code="timeout" if res.status == "unknown" else "infeasible",
                    message="Aucune solution trouvée dans le temps imparti : augmentez la limite ou assouplissez les contraintes.",
                    params={"time_limit_s": req.time_limit_s},
                )
            ],
        )
    diags = _relaxation_diagnostics(relaxed, rres)
    if not diags and res.status == "unknown":
        diags = [
            Diagnostic(
                code="timeout",
                message="Le temps imparti est trop court pour trouver un plan ; un plan approché est proposé.",
                params={"time_limit_s": req.time_limit_s},
            )
        ]
    out = _response(relaxed, rres, diags)
    return out.model_copy(update={"status": "infeasible", "wall_time_ms": res.wall_ms + rres.wall_ms})


def _euros(cents: int) -> str:
    return f"{cents // 100},{cents % 100:02d} €"


def _relaxation_diagnostics(mdl: Model, res: Solved) -> list[Diagnostic]:
    s = res.solver
    out: list[Diagnostic] = []
    for key, (var, params) in sorted(mdl.slacks.items()):
        value = int(s.value(var))
        if value <= 0:
            continue
        if key == "budget":
            minimum = int(params["budget_cents"]) + value
            out.append(
                Diagnostic(
                    code="budget_too_low",
                    message=f"Budget trop bas pour ces contraintes : minimum estimé {_euros(minimum)}.",
                    params={"budget_cents": params["budget_cents"], "minimum_cents": minimum},
                )
            )
        elif key.startswith("repeat:"):
            out.append(
                Diagnostic(
                    code="repeat_window",
                    message=f"Pas assez de recettes compatibles pour éviter les répétitions sur {params['k']} jours.",
                    params={**params, "excess": value},
                )
            )
        elif key.startswith("perishable:"):
            out.append(
                Diagnostic(
                    code="perishable",
                    message=f"Impossible de consommer tout le stock de {params['ingredient']} avant sa date limite.",
                    params={**params, "missing_centi": value},
                )
            )
    # Regroupe les répétitions (une seule ligne lisible suffit)
    seen: set[str] = set()
    dedup: list[Diagnostic] = []
    for d in out:
        k = d.code if d.code == "repeat_window" else d.code + d.message
        if k not in seen:
            seen.add(k)
            dedup.append(d)
    return dedup


def _response(mdl: Model, res: Solved, diags: list[Diagnostic]) -> PlanResponse:
    s = res.solver
    meals: list[Meal] = []
    chosen: dict[SlotKey, str] = {}
    cooked_big: dict[str, list[SlotKey]] = {}
    for (rid, t), v in mdl.x.items():
        if s.value(v):
            chosen[t] = rid
    for (rid, t), v in mdl.big.items():
        if s.value(v):
            cooked_big.setdefault(rid, []).append(t)
    leftovers: dict[SlotKey, str] = {t: rid for (rid, t), v in mdl.lo.items() if s.value(v)}

    ingredient_users: dict[str, int] = {}
    for rid in chosen.values():
        for ri in mdl.recipes[rid].ingredients:
            ingredient_users[ri.ingredient_id] = ingredient_users.get(ri.ingredient_id, 0) + 1

    prev_protein: dict[int, str | None] = {}
    infos = sorted(mdl.slots, key=lambda i: (i.day, SLOT_ORDER[i.slot]))
    for info in infos:
        t = info.key
        if t in chosen:
            rid = chosen[t]
            ex = _explain(mdl, info, rid, prev_protein.get(info.day - 1), ingredient_users)
            big = t in cooked_big.get(rid, [])
            if big:
                target = next(
                    (
                        lt
                        for lt, lr in sorted(leftovers.items(), key=lambda kv: (kv[0][0], SLOT_ORDER[kv[0][1]]))
                        if lr == rid and lt[0] > t[0]
                    ),
                    None,
                )
                if target is not None:
                    ex.append(Explanation(code="batch_cook", params={"for_day": target[0], "for_slot": target[1]}))
            meals.append(
                Meal(
                    day=t[0],
                    slot=info.slot,
                    recipe_id=rid,
                    servings_centi=info.servings_centi,
                    cook_big=big,
                    leftover_of=None,
                    explanations=ex,
                )
            )
            prot = mdl.recipes[rid].protein
            if prot:
                prev_protein[info.day] = prot
        elif t in leftovers:
            rid = leftovers[t]
            src = max((b for b in cooked_big.get(rid, []) if b[0] < t[0]), default=None)
            meals.append(
                Meal(
                    day=t[0],
                    slot=info.slot,
                    recipe_id=rid,
                    servings_centi=info.servings_centi,
                    cook_big=False,
                    leftover_of=LeftoverRef(day=src[0], slot=src[1]) if src else None,
                    explanations=[Explanation(code="leftover", params={"from_day": src[0] if src else -1})],
                )
            )
    cost = int(sum(s.value(p) * (mdl.ingredients[i].pack_price_cents or 0) for i, p in mdl.packs.items()))
    seasons = [mdl.recipes[r].season_score for r in chosen.values()]
    gaps = [int(s.value(g)) for g in mdl.kcal_gaps]
    score = Score(
        objective=int(s.objective_value),
        cost_cents=cost,
        distinct_ingredients=int(sum(s.value(v) for v in mdl.ing_used.values())),
        pantry_used_centi=int(sum(s.value(v) for v in mdl.used_pantry.values())),
        seasonality_avg=round(sum(seasons) / len(seasons), 1) if seasons else 0.0,
        distinct_proteins=int(sum(s.value(v) for v in mdl.protein_used.values())),
        distinct_cuisines=int(sum(s.value(v) for v in mdl.cuisine_used.values())),
        preference_total=sum(mdl.recipes[r].preference for r in chosen.values()),
        kcal_gap_per_day=round(sum(gaps) / len(gaps)) if gaps else 0,
    )
    partial = any(i.pack_size_centi is None or i.pack_price_cents is None for i in (mdl.ingredients[k] for k in mdl.need))
    if partial:
        diags = [
            *diags,
            Diagnostic(code="partial_prices", message="Certains ingrédients n'ont pas de prix : le coût est un minorant.", params={}),
        ]
    return PlanResponse(
        status="optimal" if res.status == "optimal" else "feasible",
        deterministic=res.deterministic,
        wall_time_ms=res.wall_ms,
        estimated_cost_cents=cost,
        score=score,
        meals=meals,
        diagnostics=diags,
    )


def _explain(mdl: Model, info: SlotInfo, rid: str, prev_protein: str | None, users: dict[str, int]) -> list[Explanation]:
    """Raisons lisibles, sous forme de codes + paramètres (traduits côté UI)."""
    r = mdl.recipes[rid]
    s = mdl.req
    out: list[Explanation] = []
    if info.locked_recipe_id == rid:
        out.append(Explanation(code="locked", params={}))
    for ri in r.ingredients:
        ing = mdl.ingredients[ri.ingredient_id]
        lots = [lot for lot in ing.pantry if lot.qty_centi > 0 and (lot.expiry_day is None or lot.expiry_day >= info.day)]
        if lots:
            soon = min((lot.expiry_day for lot in lots if lot.expiry_day is not None), default=None)
            p: dict[str, str | int] = {"ingredient": ing.name, "qty_centi": coef(ri.qty_per_serving_centi, info.servings_centi)}
            if soon is not None:
                p["expiry_day"] = soon
            out.append(Explanation(code="uses_pantry", params=p))
    if r.season_score >= 70:
        out.append(Explanation(code="in_season", params={"score": r.season_score}))
    if r.preference >= 2:
        out.append(Explanation(code="favorite", params={}))
    if r.total_minutes <= info.max_minutes:
        out.append(Explanation(code="fits_time", params={"minutes": r.total_minutes, "limit": info.max_minutes}))
    if r.protein and prev_protein and r.protein != prev_protein:
        out.append(Explanation(code="protein_variety", params={"protein": r.protein, "previous": prev_protein}))
    shared = sum(1 for ri in r.ingredients if users.get(ri.ingredient_id, 0) > 1)
    if shared >= 2:
        out.append(Explanation(code="shared_ingredients", params={"count": shared}))
    serving_cost = _serving_cost(mdl, rid)
    if serving_cost is not None:
        out.append(Explanation(code="cost_per_serving", params={"cents": serving_cost}))
    if s.kcal_target_per_day and r.kcal_per_serving:
        out.append(Explanation(code="kcal", params={"per_serving": r.kcal_per_serving, "share": KCAL_SHARE[info.slot]}))
    return out


def _serving_cost(mdl: Model, rid: str) -> int | None:
    total = Fraction(0)
    for ri in mdl.recipes[rid].ingredients:
        ing = mdl.ingredients[ri.ingredient_id]
        if ing.pack_size_centi is None or ing.pack_price_cents is None:
            return None
        total += Fraction(ri.qty_per_serving_centi * ing.pack_price_cents, ing.pack_size_centi)
    return round(total)
