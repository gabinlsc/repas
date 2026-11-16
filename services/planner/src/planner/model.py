"""Construction et résolution du modèle CP-SAT.

Variables :
  x[r, t]   recette r cuisinée au créneau t (t = (jour, créneau))
  big[r, t] r cuisinée en double au créneau t (batch cooking) — implique x[r, t]
  lo[r, t]  restes de r servis au créneau t
Contraintes dures : un repas par créneau, verrous, fenêtre de répétition, budget,
consommation des périssables avant DLC. Exclusions (allergènes, régimes, temps,
équipement) : par absence de variable (voir candidates.py).

En mode « relaxé » (diagnostic d'infaisabilité), chaque famille relâchable reçoit une
variable d'écart fortement pénalisée ; les écarts non nuls désignent les contraintes
incompatibles.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from planner.candidates import SLOT_ORDER, SlotInfo, SlotKey, filter_candidates, is_safe, slot_infos
from planner.schemas import Ingredient, PlanRequest, Recipe

# Part énergétique indicative de chaque repas dans la journée (répartition usuelle).
KCAL_SHARE = {"breakfast": 20, "lunch": 35, "dinner": 35, "snack": 10}
# Pénalité d'écart en mode relaxé : domine tout le reste de l'objectif. Les familles sont
# hiérarchisées pour que le diagnostic désigne la cause la plus « naturelle » : on préfère
# dépasser le budget (1 par centime) que répéter une recette (≈ 1 000 €) ou laisser périmer
# un aliment (≈ 10 € par gramme).
SLACK_PENALTY = 1_000_000
SLACK_WEIGHT = {"budget": 1, "repeat": 100_000, "perishable": 10}
# Échelle de l'objectif : milli-centimes, pour garder des coefficients entiers fins.
SCALE = 1000
# Temps déterministe accordé par seconde de limite : calibré pour qu'un plan de 500 recettes
# se termine en ~50 % de la limite sur la machine de référence (4 vCPU), donc sans
# jamais atteindre la limite murale qui casserait la reproductibilité (D-006).
DET_PER_SECOND = 0.8


@dataclass
class Model:
    req: PlanRequest
    relaxed: bool
    m: cp_model.CpModel = field(default_factory=cp_model.CpModel)
    slots: list[SlotInfo] = field(default_factory=list)
    x: dict[tuple[str, SlotKey], cp_model.IntVar] = field(default_factory=dict)
    big: dict[tuple[str, SlotKey], cp_model.IntVar] = field(default_factory=dict)
    lo: dict[tuple[str, SlotKey], cp_model.IntVar] = field(default_factory=dict)
    need: dict[str, cp_model.LinearExpr | int] = field(default_factory=dict)
    packs: dict[str, cp_model.IntVar] = field(default_factory=dict)
    used_pantry: dict[str, cp_model.IntVar] = field(default_factory=dict)
    cost: cp_model.LinearExpr | int = 0
    slacks: dict[str, tuple[cp_model.IntVar, dict[str, str | int]]] = field(default_factory=dict)
    kcal_gaps: list[cp_model.IntVar] = field(default_factory=list)
    protein_used: dict[str, cp_model.IntVar] = field(default_factory=dict)
    cuisine_used: dict[str, cp_model.IntVar] = field(default_factory=dict)
    ing_used: dict[str, cp_model.IntVar] = field(default_factory=dict)
    recipes: dict[str, Recipe] = field(default_factory=dict)
    ingredients: dict[str, Ingredient] = field(default_factory=dict)
    servings: dict[SlotKey, int] = field(default_factory=dict)
    locked: set[SlotKey] = field(default_factory=set)
    x_by_recipe: dict[str, list[tuple[SlotKey, cp_model.IntVar]]] = field(default_factory=dict)
    x_by_slot: dict[SlotKey, list[tuple[str, cp_model.IntVar]]] = field(default_factory=dict)


def coef(qty_per_serving_centi: int, servings_centi: int) -> int:
    """Quantité pour le créneau, arrondie au supérieur (jamais sous-estimer un besoin)."""
    return -(-qty_per_serving_centi * servings_centi // 100)


def build(req: PlanRequest, relaxed: bool = False) -> Model:
    mdl = Model(req=req, relaxed=relaxed)
    mdl.recipes = {r.id: r for r in req.recipes}
    mdl.ingredients = {i.id: i for i in req.ingredients}
    mdl.slots = slot_infos(req)
    mdl.servings = {i.key: i.servings_centi for i in mdl.slots}
    mdl.locked = {i.key for i in mdl.slots if i.locked_recipe_id is not None}
    m = mdl.m
    n_days = max((d.day for d in req.days), default=-1) + 1

    # --- Variables de décision -------------------------------------------------
    for info in mdl.slots:
        t = info.key
        if info.locked_recipe_id is not None:
            r = mdl.recipes[info.locked_recipe_id]
            if not is_safe(r, info):
                continue  # signalé par la pré-analyse ; créneau sans variable ⇒ infaisable
            mdl.x[(r.id, t)] = m.new_constant(1)
            continue
        for r in filter_candidates(req, info).candidates:
            mdl.x[(r.id, t)] = m.new_bool_var(f"x[{r.id},{t[0]},{t[1]}]")
    for (rid, t), v in mdl.x.items():
        mdl.x_by_recipe.setdefault(rid, []).append((t, v))
        mdl.x_by_slot.setdefault(t, []).append((rid, v))

    # Restes : une recette « batch » cuisinée en double à t' alimente un créneau t ultérieur.
    order = {info.key: i for i, info in enumerate(mdl.slots)}
    for info in mdl.slots:
        if info.locked_recipe_id is not None:
            continue
        if not req.allow_leftovers:
            break
        for r in req.recipes:
            if r.leftover_days == 0 or info.slot not in r.slots or not is_safe(r, info):
                continue
            window = 7 if r.freezes else r.leftover_days
            sources = [
                (r.id, src)
                for (src, _v) in mdl.x_by_recipe.get(r.id, [])
                if order[src] < order[info.key] and 0 < info.day - src[0] <= window and _servings(mdl, src) >= info.servings_centi
            ]
            if not sources:
                continue
            lo = m.new_bool_var(f"lo[{r.id},{info.day},{info.slot}]")
            mdl.lo[(r.id, info.key)] = lo
            for rid, src in sources:
                if (rid, src) not in mdl.big:
                    b = m.new_bool_var(f"big[{rid},{src[0]},{src[1]}]")
                    m.add_implication(b, mdl.x[(rid, src)])
                    mdl.big[(rid, src)] = b
            m.add(lo <= sum(mdl.big[s] for s in sources))
    lo_by_recipe: dict[str, list[tuple[SlotKey, cp_model.IntVar]]] = {}
    for (rid, t), v in mdl.lo.items():
        lo_by_recipe.setdefault(rid, []).append((t, v))
    for rid, los in lo_by_recipe.items():
        bigs = [v for (r2, _t), v in mdl.big.items() if r2 == rid]
        m.add(sum(v for _t, v in los) <= sum(bigs))
    # Un double sans reste servi serait du gaspillage : chaque big doit être consommé.
    for (rid, src), b in mdl.big.items():
        later = [v for t, v in lo_by_recipe.get(rid, []) if order[t] > order[src]]
        m.add(b <= sum(later))

    # --- Un repas par créneau --------------------------------------------------
    for info in mdl.slots:
        terms = [v for _rid, v in mdl.x_by_slot.get(info.key, [])] + [v for (_rid, t), v in mdl.lo.items() if t == info.key]
        if not terms:
            m.add_bool_or([])  # créneau impossible : modèle infaisable (diagnostiqué en amont)
            continue
        m.add_exactly_one(terms)

    # --- Fenêtre de non-répétition ---------------------------------------------
    k_main = req.repeat_window_days
    # Petit-déjeuner et collation : fenêtre complète si le catalogue compatible est assez
    # riche (≥ 2 recettes par jour planifié), sinon fenêtre courte de 3 jours.
    morning_candidates = len({rid for (rid, t) in mdl.x if t[1] in ("breakfast", "snack")})
    morning_k = k_main if morning_candidates >= 2 * max(1, n_days) else min(k_main, 3)
    if k_main > 0:
        for r in req.recipes:
            k = morning_k if set(r.slots) <= {"breakfast", "snack"} else k_main
            for start in range(0, max(1, n_days - k + 1)):
                in_window = [(t, v) for t, v in mdl.x_by_recipe.get(r.id, []) if start <= t[0] < start + k]
                window_vars = [v for _t, v in in_window]
                fixed = sum(1 for t, _v in in_window if t in mdl.locked)
                if len(window_vars) <= 1:
                    continue
                limit = max(1, fixed)
                if relaxed:
                    s = m.new_int_var(0, len(window_vars), f"slack_repeat[{r.id},{start}]")
                    mdl.slacks[f"repeat:{r.id}:{start}"] = (s, {"recipe": r.id, "window_start": start, "k": k})
                    m.add(sum(window_vars) <= limit + s)
                else:
                    m.add(sum(window_vars) <= limit)

    # --- Besoins en ingrédients -------------------------------------------------
    # (variable, coefficient, jour) : le jour sert aux contraintes de DLC.
    need_terms: dict[str, list[tuple[cp_model.IntVar, int, int]]] = {}
    for (rid, t), v in list(mdl.x.items()) + list(mdl.big.items()):
        r = mdl.recipes[rid]
        sv = _servings(mdl, t)
        for ri in r.ingredients:
            c = coef(ri.qty_per_serving_centi, sv)
            if c > 0:
                need_terms.setdefault(ri.ingredient_id, []).append((v, c, t[0]))
    for iid, iterms in need_terms.items():
        mdl.need[iid] = sum(c * v for v, c, _d in iterms)

    cost_terms: list[cp_model.LinearExpr] = []
    for iid, need in mdl.need.items():
        ing = mdl.ingredients[iid]
        ub = sum(c for _v, c, _d in need_terms[iid])
        pantry_total = sum(lot.qty_centi for lot in ing.pantry if lot.expiry_day is None or lot.expiry_day >= 0)
        used = m.new_int_var(0, min(ub, pantry_total), f"pantry[{iid}]")
        m.add(used <= need)
        mdl.used_pantry[iid] = used
        if ing.pack_size_centi is not None and ing.pack_price_cents is not None:
            max_packs = -(-ub // ing.pack_size_centi) + 1
            p = m.new_int_var(0, max_packs, f"packs[{iid}]")
            m.add(p * ing.pack_size_centi >= need - pantry_total)
            mdl.packs[iid] = p
            cost_terms.append(p * ing.pack_price_cents)
        # Formulation agrégée (une contrainte par ingrédient plutôt qu'une implication par
        # variable) : le préprocesseur reste rapide sur les gros catalogues.
        flag = m.new_bool_var(f"uses[{iid}]")
        m.add(need <= ub * flag)
        mdl.ing_used[iid] = flag

        # Périssables à consommer avant DLC (contrainte cumulative par date d'expiration).
        must = sorted((lot for lot in ing.pantry if lot.must_use and lot.expiry_day is not None), key=lambda lot: lot.expiry_day or 0)
        cumulative = 0
        for lot in must:
            assert lot.expiry_day is not None
            cumulative += lot.qty_centi
            before = [c * v for v, c, d in need_terms[iid] if d <= lot.expiry_day]
            if relaxed:
                s = m.new_int_var(0, cumulative, f"slack_dlc[{iid},{lot.expiry_day}]")
                mdl.slacks[f"perishable:{iid}:{lot.expiry_day}"] = (
                    s,
                    {"ingredient": ing.name, "expiry_day": lot.expiry_day, "qty_centi": cumulative},
                )
                m.add(sum(before) + s >= cumulative)
            else:
                m.add(sum(before) >= cumulative)
    # Périssable dont aucune recette candidate n'utilise l'ingrédient : impossible à consommer.
    for ing in req.ingredients:
        if ing.id not in mdl.need and any(lot.must_use for lot in ing.pantry):
            qty = sum(lot.qty_centi for lot in ing.pantry if lot.must_use)
            if relaxed:
                s = m.new_constant(qty)
                mdl.slacks[f"perishable:{ing.id}:none"] = (s, {"ingredient": ing.name, "expiry_day": -1, "qty_centi": qty})
            else:
                m.add_bool_or([])

    mdl.cost = sum(cost_terms) if cost_terms else 0
    if req.budget_cents is not None:
        # Budget toujours « souple » : un dépassement est très pénalisé mais reste possible,
        # pour toujours proposer une semaine variée (le dépassement est signalé).
        s = m.new_int_var(0, 10_000_000, "slack_budget")
        mdl.slacks["budget"] = (s, {"budget_cents": req.budget_cents})
        m.add(mdl.cost <= req.budget_cents + s)

    _objective(mdl, n_days)
    _greedy_hint(mdl)
    return mdl


def _jitter(seed: int, rid: str) -> int:
    """Entier pseudo-aléatoire stable dans [0, 100) pour (graine, recette)."""
    h = hashlib.blake2b(f"{seed}:{rid}".encode(), digest_size=4).digest()
    return int.from_bytes(h, "big") % 100


def _greedy_hint(mdl: Model) -> None:
    """Indice de départ glouton (meilleur score local sans répétition).

    Sans lui, CP-SAT peut passer plusieurs secondes à trouver une première solution sur
    les gros catalogues ; avec lui, la recherche démarre d'un plan complet et l'améliore.
    """
    k = max(1, mdl.req.repeat_window_days)
    total_servings = sum(i.servings_centi for i in mdl.slots) or 1
    # Allocation du budget au prorata des portions : l'indice de départ reste finançable.
    allowance = {i.key: (mdl.req.budget_cents or 0) * i.servings_centi // total_servings for i in mdl.slots}
    last_day: dict[str, int] = {}
    family_count: dict[str, int] = {}
    for info in sorted(mdl.slots, key=lambda i: (i.day, SLOT_ORDER[i.slot])):
        options = mdl.x_by_slot.get(info.key, [])
        best: tuple[int, str] | None = None
        for rid, _v in options:
            if info.key in mdl.locked:
                best = (0, rid)
                break
            prev = last_day.get(rid)
            if prev is not None and info.day - prev < k:
                continue
            r = mdl.recipes[rid]
            # Coût indicatif par portion (centimes) : garde l'indice sous le budget.
            cost = sum(
                ri.qty_per_serving_centi
                * (mdl.ingredients[ri.ingredient_id].pack_price_cents or 0)
                // (mdl.ingredients[ri.ingredient_id].pack_size_centi or 1)
                for ri in r.ingredients
            )
            score = (
                _jitter(mdl.req.seed, rid) * 3
                - (400 * max(1, 5 - mdl.req.recent[rid]) if rid in mdl.req.recent else 0)
                + r.preference * 50
                + (r.season_score - 50) * 2
                - len(r.ingredients) * 5
                - cost * (2 if mdl.req.budget_cents is not None else 1)
                - (200 if r.family and family_count.get(r.family, 0) >= 2 else 0)
                - (2000 if mdl.req.budget_cents is not None and cost * info.servings_centi // 100 > allowance[info.key] * 8 // 10 else 0)
            )
            if best is None or score > best[0] or (score == best[0] and rid < best[1]):
                best = (score, rid)
        if best is None and options:
            best = (0, options[0][0])
        for rid, v in options:
            mdl.m.add_hint(v, 1 if best is not None and rid == best[1] else 0)
        if best is not None:
            last_day[best[1]] = info.day
            fam = mdl.recipes[best[1]].family
            if fam:
                family_count[fam] = family_count.get(fam, 0) + 1
    for v in list(mdl.big.values()) + list(mdl.lo.values()):
        mdl.m.add_hint(v, 0)


def _servings(mdl: Model, t: SlotKey) -> int:
    return mdl.servings[t]


def _objective(mdl: Model, n_days: int) -> None:
    req, m, w = mdl.req, mdl.m, mdl.req.weights
    obj: list[cp_model.LinearExpr | int] = []

    # Coût net (centimes → milli-centimes).
    obj.append(w.cost * SCALE * mdl.cost)

    # Utilisation du stock, valorisée au prix unitaire ; doublée si DLC proche.
    for iid, used in mdl.used_pantry.items():
        ing = mdl.ingredients[iid]
        if ing.pack_size_centi and ing.pack_price_cents is not None:
            value = max(1, round(SCALE * ing.pack_price_cents / ing.pack_size_centi))
        else:
            value = 5  # ≈ 0,5 centime par gramme : ordre de grandeur d'un produit de base
        urgent = any(lot.expiry_day is not None and lot.expiry_day < n_days for lot in ing.pantry)
        obj.append(-w.pantry * value * (2 if urgent else 1) * used)

    # Mutualisation : chaque ingrédient distinct coûte ~30 centimes de complexité.
    obj.append(w.distinct_ingredients * 30 * SCALE * sum(mdl.ing_used.values()))

    # Saisonnalité et préférences, par repas cuisiné.
    for (rid, t), v in mdl.x.items():
        r = mdl.recipes[rid]
        obj.append(-w.seasonality * 6 * SCALE * (r.season_score - 50) * v)
        obj.append(-w.preferences * 50 * SCALE * r.preference * v)
        _ = t
    # Restes : légère pénalité (un plat répété), compensée par l'économie d'achats.
    for v in mdl.lo.values():
        obj.append(w.diversity * 20 * SCALE * v)

    # Variété d'une génération à l'autre : bruit déterministe dérivé de la graine
    # (même graine ⇒ même plan, graine différente ⇒ plan différent à qualité comparable).
    for (rid, _t), v in mdl.x.items():
        obj.append(-(1 + w.diversity) * _jitter(req.seed, rid) * SCALE * v)

    # Variété d'une semaine à l'autre : pénalité décroissante selon l'ancienneté.
    for (rid, _t), v in mdl.x.items():
        weeks = req.recent.get(rid)
        if weeks is not None:
            obj.append((1 + w.diversity) * max(1, 5 - weeks) * 200 * SCALE * v)

    # Une même recette plusieurs fois dans la semaine (possible au petit-déjeuner) : pénalisée.
    for rid, entries in mdl.x_by_recipe.items():
        if len(entries) <= 1 or any(t in mdl.locked for t, _v in entries):
            continue
        extra = m.new_int_var(0, len(entries), f"repeat_excess[{rid}]")
        m.add(extra >= sum(v for _t, v in entries) - 1)
        obj.append((1 + w.diversity) * 600 * SCALE * extra)

    # Même protéine trop souvent (jambon partout…) : > 2 fois par semaine ou 2 fois le même jour.
    prot_week: dict[str, list[cp_model.IntVar]] = {}
    prot_day: dict[tuple[str, int], list[cp_model.IntVar]] = {}
    for (rid, t), v in mdl.x.items():
        prot = mdl.recipes[rid].protein
        # Les œufs du petit-déjeuner ne comptent pas : seuls les repas principaux sont visés.
        if prot and t[1] in ("lunch", "dinner"):
            prot_week.setdefault(prot, []).append(v)
            prot_day.setdefault((prot, t[0]), []).append(v)
    for prot, vs in prot_week.items():
        if len(vs) > 2:
            ex = m.new_int_var(0, len(vs), f"protein_excess[{prot}]")
            m.add(ex >= sum(vs) - 2)
            obj.append((1 + w.diversity) * 400 * SCALE * ex)
    for (prot, d), vs in prot_day.items():
        if len(vs) > 1:
            ex = m.new_int_var(0, len(vs), f"protein_day[{prot},{d}]")
            m.add(ex >= sum(vs) - 1)
            obj.append((1 + w.diversity) * 300 * SCALE * ex)

    # Monotonie : plus de 2 plats d'une même famille (pâtes, riz, gratin…) dans la semaine.
    families: dict[str, list[cp_model.IntVar]] = {}
    for (rid, _t), v in mdl.x.items():
        fam = mdl.recipes[rid].family
        if fam:
            families.setdefault(fam, []).append(v)
    # Même famille deux fois le même jour (pâtes midi et soir) : nettement pénalisé.
    fam_day: dict[tuple[str, int], list[cp_model.IntVar]] = {}
    for (rid, t), v in mdl.x.items():
        fam = mdl.recipes[rid].family
        if fam:
            fam_day.setdefault((fam, t[0]), []).append(v)
    for (fam, d), vs in fam_day.items():
        if len(vs) <= 1:
            continue
        same = m.new_int_var(0, len(vs), f"family_day[{fam},{d}]")
        m.add(same >= sum(vs) - 1)
        obj.append((1 + w.diversity) * 500 * SCALE * same)
    for fam, vs in families.items():
        if len(vs) <= 2:
            continue
        excess = m.new_int_var(0, len(vs), f"family_excess[{fam}]")
        m.add(excess >= sum(vs) - 2)
        obj.append((1 + w.diversity) * 300 * SCALE * excess)

    # Diversité : protéines/cuisines distinctes, pénalité si même protéine deux jours de suite.
    proteins = sorted({r.protein for r in req.recipes if r.protein})
    by_protein: dict[str, list[tuple[tuple[str, SlotKey], cp_model.IntVar]]] = {}
    for key, v in mdl.x.items():
        prot = mdl.recipes[key[0]].protein
        if prot:
            by_protein.setdefault(prot, []).append((key, v))
    cuisines = sorted({r.cuisine for r in req.recipes if r.cuisine})
    for p in proteins:
        per_day: dict[int, cp_model.IntVar] = {}
        for d in range(n_days):
            vs = [v for (rid, t), v in by_protein.get(p, []) if t[0] == d]
            if not vs:
                continue
            pd = m.new_bool_var(f"prot[{p},{d}]")
            m.add_max_equality(pd, vs)
            per_day[d] = pd
        if not per_day:
            continue
        used = m.new_bool_var(f"prot_used[{p}]")
        m.add_max_equality(used, list(per_day.values()))
        mdl.protein_used[p] = used
        obj.append(-w.diversity * 150 * SCALE * used)
        for d, pd in per_day.items():
            nxt = per_day.get(d + 1)
            if nxt is None:
                continue
            both = m.new_bool_var(f"prot_seq[{p},{d}]")
            m.add(both >= pd + nxt - 1)
            obj.append(w.diversity * 100 * SCALE * both)
    for c in cuisines:
        vs = [v for (rid, _t), v in mdl.x.items() if mdl.recipes[rid].cuisine == c]
        if not vs:
            continue
        used = m.new_bool_var(f"cuisine_used[{c}]")
        m.add_max_equality(used, vs)
        mdl.cuisine_used[c] = used
        obj.append(-w.diversity * 60 * SCALE * used)

    # Nutrition : écart absolu à la cible kcal du foyer, au prorata des repas planifiés.
    if req.kcal_target_per_day:
        for d in range(n_days):
            day_slots = [i for i in mdl.slots if i.day == d]
            if not day_slots:
                continue
            target = req.kcal_target_per_day * sum(KCAL_SHARE[i.slot] for i in day_slots) // 100
            served_terms = []
            for i in day_slots:
                for rid, v in mdl.x_by_slot.get(i.key, []):
                    served_terms.append(mdl.recipes[rid].kcal_per_serving * i.servings_centi // 100 * v)
                for (rid, t), v in mdl.lo.items():
                    if t == i.key:
                        served_terms.append(mdl.recipes[rid].kcal_per_serving * i.servings_centi // 100 * v)
            served = sum(served_terms)
            gap = m.new_int_var(0, 100_000, f"kcal_gap[{d}]")
            m.add(gap >= served - target)
            m.add(gap >= target - served)
            mdl.kcal_gaps.append(gap)
            obj.append(w.nutrition * 100 * gap)

    for slack_key, (s, _params) in mdl.slacks.items():
        family = slack_key.split(":")[0]
        if family == "budget":
            # Dépassement de budget : très cher (8 fois le coût normal) mais pas absolu, pour que
            # la variété continue de compter dans le meilleur compromis proposé.
            obj.append(8 * max(1, w.cost) * SCALE * s)
        else:
            obj.append(SLACK_WEIGHT[family] * SLACK_PENALTY * SCALE * s)
    m.minimize(sum(obj))


@dataclass
class Solved:
    status: str
    solver: cp_model.CpSolver
    deterministic: bool
    wall_ms: int


def _params(solver: cp_model.CpSolver, seed: int, workers: int, det_time: float, wall_s: float, lns_only: bool) -> None:
    p = solver.parameters
    p.random_seed = seed
    p.num_workers = workers
    # D-006 : recherche multi-thread entrelacée = déterministe ; budget en temps déterministe.
    p.interleave_search = True
    p.use_lns_only = lns_only
    p.max_deterministic_time = det_time
    p.max_time_in_seconds = wall_s
    p.log_search_progress = False
    # Le sondage de présolve coûte plusieurs secondes sur 500 recettes pour un gain
    # marginal : la recherche à grand voisinage (LNS) est plus rentable ici.
    p.cp_model_probing_level = 0
    p.max_presolve_iterations = 1


def solve(mdl: Model, seed: int, time_limit_s: int, workers: int = 8) -> Solved:
    """Phase 1 : LNS seul depuis l'indice glouton (rapide, déterministe).
    Phase 2, si aucune solution (indice infaisable, ex. budget serré) : recherche complète
    entrelacée sur le temps restant, capable de prouver l'infaisabilité."""
    t0 = time.monotonic()
    det_budget = float(time_limit_s) * DET_PER_SECOND
    solver = cp_model.CpSolver()
    _params(solver, seed, workers, det_budget * 0.6, float(time_limit_s), lns_only=True)
    code = solver.solve(mdl.m)
    hit_wall = solver.wall_time >= time_limit_s * 0.98 and solver.deterministic_time < det_budget * 0.6 * 0.98
    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE, cp_model.INFEASIBLE, cp_model.MODEL_INVALID):
        remaining = max(1.0, time_limit_s - (time.monotonic() - t0))
        solver = cp_model.CpSolver()
        _params(solver, seed, workers, det_budget * 0.4, remaining, lns_only=False)
        code = solver.solve(mdl.m)
        hit_wall = hit_wall or (
            solver.wall_time >= remaining * 0.98 and solver.deterministic_time < solver.parameters.max_deterministic_time * 0.98
        )
    wall_ms = int((time.monotonic() - t0) * 1000)
    status = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "invalid",
    }.get(code, "unknown")
    return Solved(status=status, solver=solver, deterministic=not hit_wall, wall_ms=wall_ms)


def sorted_slots(mdl: Model) -> list[SlotInfo]:
    return sorted(mdl.slots, key=lambda i: (i.day, SLOT_ORDER[i.slot]))
