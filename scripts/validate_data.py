#!/usr/bin/env python3
"""Fail fast when a generated public dataset is incomplete or misleading."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data" / "dashboard.json"


def validate(payload: dict) -> list[str]:
    errors: list[str] = []
    if payload.get("schema_version") != 1:
        errors.append("unsupported schema_version")
    generation = payload.get("generation", [])
    if not generation:
        errors.append("generation is empty")
    if any(row.get("period", "") < "2019-01" for row in generation):
        errors.append("generation predates configured coverage")
    seen = set()
    for row in generation:
        key = (row.get("period"), row.get("series"))
        if key in seen:
            errors.append(f"duplicate generation row: {key}")
            break
        seen.add(key)
        if row.get("value", 0) < 0:
            errors.append(f"negative generation: {key}")
    cutoff = payload.get("marginal_technology", {}).get("cutoff", "")
    for row in payload.get("marginal_technology", {}).get("rows", []):
        if row.get("timestamp", "") > cutoff:
            errors.append("marginal technology extends beyond source cutoff")
            break
    if payload.get("hourly", {}).get("status") == "unavailable" and payload.get("hourly", {}).get("years"):
        errors.append("unavailable hourly module contains data")
    return errors


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    errors = validate(payload)
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Validated {len(payload['generation']):,} generation rows from real sources")


if __name__ == "__main__":
    main()
