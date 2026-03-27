from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .sample_store import MARGINAL_CUTOFF, ensure_store


def _month_to_year(period: str) -> str:
    return f"{period[:4]}-01-01"


def _aggregate_rows(
    rows: list[dict[str, Any]],
    grain: str,
    key_field: str,
    value_field: str,
    period_field: str = "period",
) -> list[dict[str, Any]]:
    if grain == "month":
        return rows
    bucket: dict[tuple[str, str], float] = defaultdict(float)
    for row in rows:
        bucket[(_month_to_year(row[period_field]), row[key_field])] += float(row[value_field])
    aggregated = []
    for (period, key), value in sorted(bucket.items()):
        aggregated.append({"period": period, key_field: key, value_field: round(value, 2)})
    return aggregated


class StoreRepository:
    def __init__(self, path: Path | None = None) -> None:
        store_path = path or ensure_store()
        self.store = json.loads(store_path.read_text(encoding="utf-8"))
        self.mappings = self.store["technology_mappings"]
        self.group_lookup = {mapping["group_key"]: mapping for mapping in self.store["technology_groups"]}

    def metadata(self) -> dict[str, Any]:
        return {
            **self.store["metadata"],
            "technology_mappings": self.mappings,
            "technology_groups": self.store["technology_groups"],
        }

    def generation(self, grain: str, technology_view: str, technology_keys: list[str] | None = None) -> dict[str, Any]:
        rows = self.store["generation_period"]
        if technology_view == "normalized":
            grouped: dict[tuple[str, str], dict[str, Any]] = {}
            for row in rows:
                key = row["group_key"]
                if technology_keys and key not in technology_keys:
                    continue
                bucket_key = (row["period"], key)
                item = grouped.setdefault(
                    bucket_key,
                    {
                        "period": row["period"],
                        "technology_key": key,
                        "technology_label": row["group_key"].replace("_", " ").title(),
                        "value_gwh": 0.0,
                        "pct_generation": 0.0,
                        "pct_demand": 0.0,
                    },
                )
                item["value_gwh"] += row["value_gwh"]
                item["pct_generation"] += row["pct_generation"]
                item["pct_demand"] += row["pct_demand"]
            base_rows = list(grouped.values())
        else:
            base_rows = [
                {
                    "period": row["period"],
                    "technology_key": row["raw_key"],
                    "technology_label": row["raw_label"],
                    "value_gwh": row["value_gwh"],
                    "pct_generation": row["pct_generation"],
                    "pct_demand": row["pct_demand"],
                }
                for row in rows
                if not technology_keys or row["raw_key"] in technology_keys
            ]
        if grain == "year":
            totals: dict[tuple[str, str], dict[str, Any]] = {}
            for row in base_rows:
                period = _month_to_year(row["period"])
                bucket = totals.setdefault(
                    (period, row["technology_key"]),
                    {
                        "period": period,
                        "technology_key": row["technology_key"],
                        "technology_label": row["technology_label"],
                        "value_gwh": 0.0,
                        "pct_generation": 0.0,
                        "pct_demand": 0.0,
                    },
                )
                bucket["value_gwh"] += row["value_gwh"]
                bucket["pct_generation"] += row["pct_generation"] / 12
                bucket["pct_demand"] += row["pct_demand"] / 12
            base_rows = list(totals.values())
        return {"grain": grain, "technology_view": technology_view, "rows": sorted(base_rows, key=lambda row: (row["period"], row["technology_key"]))}

    def generation_detail(self, technology_keys: list[str], technology_view: str) -> dict[str, Any]:
        monthly = self.generation("month", technology_view, technology_keys)["rows"]
        annual = self.generation("year", technology_view, technology_keys)["rows"]
        return {
            "technology_keys": technology_keys,
            "technology_view": technology_view,
            "monthly": monthly,
            "annual": annual,
        }

    def exchanges(self, grain: str, country: str | None = None, direction: str = "net") -> dict[str, Any]:
        rows = self.store["exchange_period"]
        filtered = [row for row in rows if not country or row["country"].lower() == country.lower()]
        field = {
            "imports": "imports_gwh",
            "exports": "exports_gwh",
            "net": "net_imports_gwh",
        }[direction]
        if grain == "month":
            rows_out = [
                {
                    "period": row["period"],
                    "country": row["country"],
                    "value_gwh": row[field],
                }
                for row in filtered
            ]
            return {"grain": grain, "direction": direction, "rows": rows_out}
        aggregated = _aggregate_rows(filtered, grain, "country", field)
        for row in aggregated:
            row["value_gwh"] = row.pop(field)
        return {"grain": grain, "direction": direction, "rows": aggregated}

    def balance(self, grain: str) -> dict[str, Any]:
        rows = self.store["balance_period"]
        if grain == "month":
            return {"grain": grain, "rows": rows}
        totals: dict[str, dict[str, Any]] = {}
        for row in rows:
            period = _month_to_year(row["period"])
            bucket = totals.setdefault(period, {"period": period})
            for key, value in row.items():
                if key == "period":
                    continue
                bucket[key] = round(bucket.get(key, 0.0) + float(value), 2)
        return {"grain": grain, "rows": list(totals.values())}

    def capacity(self, grain: str) -> dict[str, Any]:
        rows = self.store["capacity_period"]
        if grain == "year":
            return {"grain": grain, "rows": rows}
        return {"grain": grain, "rows": rows}

    def emissions(self, grain: str) -> dict[str, Any]:
        rows = self.store["emissions_period"]
        if grain == "month":
            return {"grain": grain, "rows": rows}
        totals: dict[tuple[str, str], dict[str, Any]] = {}
        for row in rows:
            period = _month_to_year(row["period"])
            bucket = totals.setdefault(
                (period, row["technology_key"]),
                {
                    "period": period,
                    "technology_key": row["technology_key"],
                    "tco2eq": 0.0,
                    "intensity_tco2_per_mwh": 0.0,
                    "months": 0,
                },
            )
            bucket["tco2eq"] += row["tco2eq"]
            bucket["intensity_tco2_per_mwh"] += row["intensity_tco2_per_mwh"]
            bucket["months"] += 1
        result = []
        for row in totals.values():
            row["intensity_tco2_per_mwh"] = round(row["intensity_tco2_per_mwh"] / max(row["months"], 1), 3)
            row.pop("months")
            result.append(row)
        return {"grain": grain, "rows": result}

    def coverage_stats(
        self,
        source_set: list[str],
        threshold: float,
        year: int | None = None,
        month: int | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> dict[str, Any]:
        hourly_rows = self.store["hourly_generation"]
        grouped: dict[str, dict[str, float]] = defaultdict(dict)
        start_dt = datetime.fromisoformat(start) if start else None
        end_dt = datetime.fromisoformat(end) if end else None
        for row in hourly_rows:
            timestamp = row["timestamp"]
            dt = datetime.fromisoformat(timestamp)
            if start_dt and dt < start_dt:
                continue
            if end_dt and dt > end_dt:
                continue
            if year and dt.year != year:
                continue
            if month and dt.month != month:
                continue
            grouped[timestamp][row["technology_key"]] = row["value_mwh"]
            grouped[timestamp]["demand_mwh"] = row["demand_mwh"]
        hours = 0
        matching = 0
        breakdown = defaultdict(int)
        for timestamp, values in grouped.items():
            demand = values["demand_mwh"]
            selected = sum(values.get(source, 0.0) for source in source_set)
            share = (selected / demand) * 100 if demand else 0
            hours += 1
            if share >= threshold:
                matching += 1
                hour_key = timestamp[:7] if month is None else timestamp[:10]
                breakdown[hour_key] += 1
        return {
            "source_set": source_set,
            "threshold": threshold,
            "year": year,
            "month": month,
            "start": start,
            "end": end,
            "hours_total": hours,
            "hours_matching": matching,
            "share_matching": round((matching / max(hours, 1)) * 100, 2),
            "breakdown": [{"period": period, "hours": hours} for period, hours in sorted(breakdown.items())],
        }

    def marginal_technology(self, start: str | None = None, end: str | None = None) -> dict[str, Any]:
        start_dt = datetime.fromisoformat(start) if start else datetime(2025, 1, 1, 0, 0)
        end_dt = datetime.fromisoformat(end) if end else datetime(2025, 1, 31, 23, 0)
        rows = []
        available_lookup = {row["timestamp"]: row for row in self.store["marginal_technology_hour"]}
        current = start_dt
        while current <= end_dt:
            timestamp = current.isoformat()
            if current <= MARGINAL_CUTOFF and timestamp in available_lookup:
                rows.append(available_lookup[timestamp])
            else:
                status = "out_of_range" if current < datetime(2024, 1, 1, 0, 0) else "not_available_from_source"
                rows.append(
                    {
                        "timestamp": timestamp,
                        "technology_label": None,
                        "availability_status": status,
                    }
                )
            current = current.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        return {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "cutoff": MARGINAL_CUTOFF.isoformat(),
            "rows": rows,
            "note": "OMIE notes that marginal-price-setting technology is not obtainable after 2025-03-18 with the new offer typology.",
        }
