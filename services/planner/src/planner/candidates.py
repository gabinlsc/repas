"""Filtrage statique des recettes par créneau.

Les contraintes d'exclusion (allergènes, régimes, équipement, temps, type de créneau) ne
sont pas des pénalités : une recette interdite n'a tout simplement pas de variable. C'est
la garantie structurelle qu'aucun plan ne peut contenir un allergène déclaré.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from planner.schemas import Day, Member, PlanRequest, Recipe, Slot, SlotRequest

SlotKey = tuple[int, Slot]


@dataclass(frozen=True)
class SlotInfo:
    day: int
    slot: Slot
    servings_centi: int
    max_minutes: int
    allergens: frozenset[str]
    diets: frozenset[str]
    locked_recipe_id: str | None

    @property
    def key(self) -> SlotKey:
        return (self.day, self.slot)


@dataclass
class Filtered:
    """Candidats retenus et, pour le diagnostic, le premier filtre ayant tout éliminé."""

    candidates: list[Recipe] = field(default_factory=list)
    eliminated_by: str | None = None


SLOT_ORDER = {"breakfast": 0, "lunch": 1, "snack": 2, "dinner": 3}


def slot_infos(req: PlanRequest) -> list[SlotInfo]:
    members = {m.id: m for m in req.members}
    out: list[SlotInfo] = []
    for d in sorted(req.days, key=lambda x: x.day):
        for s in sorted(d.slots, key=lambda x: SLOT_ORDER[x.slot]):
            out.append(_info(d, s, members))
    return out


def _info(d: Day, s: SlotRequest, members: dict[str, Member]) -> SlotInfo:
    eaters = [members[a] for a in s.attendees]
    return SlotInfo(
        day=d.day,
        slot=s.slot,
        servings_centi=s.servings_centi,
        max_minutes=d.max_prep_minutes,
        allergens=frozenset(a for m in eaters for a in m.allergens),
        diets=frozenset(x for m in eaters for x in m.diets),
        locked_recipe_id=s.locked_recipe_id,
    )


def is_safe(recipe: Recipe, info: SlotInfo) -> bool:
    """Allergènes et régimes : seule règle qui s'applique même aux repas verrouillés."""
    return not (set(recipe.allergens) & info.allergens) and info.diets <= set(recipe.diets)


def filter_candidates(req: PlanRequest, info: SlotInfo) -> Filtered:
    equipment = set(req.equipment)
    steps: list[tuple[str, Callable[[Recipe], bool]]] = [
        ("slot_type", lambda r: info.slot in r.slots),
        ("allergens", lambda r: not (set(r.allergens) & info.allergens)),
        ("diets", lambda r: info.diets <= set(r.diets)),
        ("equipment", lambda r: set(r.equipment) <= equipment),
        ("time", lambda r: r.total_minutes <= info.max_minutes),
    ]
    pool = list(req.recipes)
    for name, pred in steps:
        nxt = [r for r in pool if pred(r)]
        if not nxt:
            return Filtered(candidates=[], eliminated_by=name)
        pool = nxt
    return Filtered(candidates=sorted(pool, key=lambda r: r.id))
