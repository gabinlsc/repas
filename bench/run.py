"""Benchmark reproductible du solveur (§5) : 500 recettes, 7 jours × 3 repas, 6 membres.

Usage : cd services/planner && uv run python ../../bench/run.py [--runs 5] [--time-limit 10]
Écrit bench/results/<date>.json et échoue (code 1) si le p95 dépasse la limite.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
from pathlib import Path

from planner.service import plan
from planner.synthetic import synthetic_request


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--time-limit", type=int, default=10)
    ap.add_argument("--recipes", type=int, default=500)
    args = ap.parse_args()
    durations: list[int] = []
    results = []
    for i in range(args.runs):
        req = synthetic_request(
            seed=1000 + i,
            n_recipes=args.recipes,
            n_ingredients=250,
            days=7,
            slots=("breakfast", "lunch", "dinner"),
            members=6,
            member_allergens=[["gluten"], [], ["fruits_a_coque"], [], [], []],
            member_diets=[[], ["vegetarian"], [], [], [], []],
            time_limit_s=args.time_limit,
        )
        t0 = time.monotonic()
        res = plan(req)
        ms = int((time.monotonic() - t0) * 1000)
        durations.append(ms)
        results.append({"seed": 1000 + i, "status": res.status, "ms": ms, "deterministic": res.deterministic, "cost_cents": res.estimated_cost_cents})
        print(f"run {i}: {res.status} {ms} ms deterministic={res.deterministic}", flush=True)
    durations.sort()
    p95 = durations[min(len(durations) - 1, int(round(0.95 * (len(durations) - 1))))]
    summary = {
        "machine": {"cpu_count": os.cpu_count(), "platform": platform.platform(), "python": platform.python_version()},
        "params": vars(args),
        "p50_ms": int(statistics.median(durations)),
        "p95_ms": p95,
        "runs": results,
    }
    out = Path(__file__).parent / "results" / f"{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(json.dumps({k: summary[k] for k in ("p50_ms", "p95_ms")}))
    ok = p95 <= args.time_limit * 1000 * 1.5 and all(r["status"] in ("optimal", "feasible") for r in results)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
