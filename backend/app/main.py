from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .repository import StoreRepository

app = FastAPI(title="Spain Electricity Dashboard API", version="0.1.0")
repo = StoreRepository()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/metadata")
def metadata() -> dict:
    return repo.metadata()


@app.get("/api/generation")
def generation(
    grain: Literal["month", "year"] = "month",
    technology_view: Literal["normalized", "raw"] = "normalized",
    technology_keys: list[str] = Query(default=[]),
) -> dict:
    return repo.generation(grain, technology_view, technology_keys or None)


@app.get("/api/generation/detail")
def generation_detail(
    technology_view: Literal["normalized", "raw"] = "normalized",
    technology_keys: list[str] = Query(default=[]),
) -> dict:
    return repo.generation_detail(technology_keys or ["solar", "wind"], technology_view)


@app.get("/api/exchanges")
def exchanges(
    grain: Literal["month", "year"] = "month",
    direction: Literal["net", "imports", "exports"] = "net",
    country: Optional[str] = None,
) -> dict:
    return repo.exchanges(grain, country, direction)


@app.get("/api/balance")
def balance(grain: Literal["month", "year"] = "month") -> dict:
    return repo.balance(grain)


@app.get("/api/capacity")
def capacity(grain: Literal["year", "month"] = "year") -> dict:
    return repo.capacity(grain)


@app.get("/api/emissions")
def emissions(grain: Literal["month", "year"] = "month") -> dict:
    return repo.emissions(grain)


@app.get("/api/coverage-stats")
def coverage_stats(
    source_set: list[str] = Query(default=["solar", "wind"]),
    threshold: float = 50,
    year: Optional[int] = None,
    month: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> dict:
    return repo.coverage_stats(source_set, threshold, year, month, start, end)


@app.get("/api/marginal-technology")
def marginal_technology(start: Optional[str] = None, end: Optional[str] = None) -> dict:
    return repo.marginal_technology(start, end)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
