"""API HTTP du solveur. Sans état : chaque requête porte un snapshot complet."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from planner import API_VERSION
from planner.logs import setup_logging
from planner.schemas import PlanRequest, PlanResponse
from planner.service import plan

log = setup_logging(os.environ.get("LOG_LEVEL", "INFO"))
WORKERS = int(os.environ.get("PLANNER_WORKERS", "8"))
# Une résolution utilise tous les cœurs : on sérialise pour garder des temps prévisibles.
MAX_CONCURRENT = int(os.environ.get("PLANNER_MAX_CONCURRENT", "2"))

PLANS = Counter("planner_requests_total", "Requêtes de planification", ["status"])
DURATION = Histogram("planner_solve_seconds", "Durée de résolution", buckets=(0.5, 1, 2, 5, 10, 15, 20, 30, 60))

app = FastAPI(title="Mise — planner", version=API_VERSION, docs_url="/docs", openapi_url="/openapi.json")
_sem = asyncio.Semaphore(MAX_CONCURRENT)


@app.middleware("http")
async def access_log(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    t0 = time.monotonic()
    response = await call_next(request)
    log.info(
        "request",
        extra={"fields": {"path": request.url.path, "status": response.status_code, "ms": int((time.monotonic() - t0) * 1000)}},
    )
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": API_VERSION}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/plan", response_model=PlanResponse)
async def plan_endpoint(req: PlanRequest) -> PlanResponse | JSONResponse:
    async with _sem:
        t0 = time.monotonic()
        res = await asyncio.to_thread(plan, req, WORKERS)
        DURATION.observe(time.monotonic() - t0)
    PLANS.labels(status=res.status).inc()
    log.info(
        "plan",
        extra={"fields": {"status": res.status, "ms": res.wall_time_ms, "meals": len(res.meals), "recipes": len(req.recipes)}},
    )
    return res


logging.getLogger("uvicorn.access").disabled = True
