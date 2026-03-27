from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "sample_store.json"
MARGINAL_CUTOFF = datetime(2025, 3, 18, 23, 0)


@dataclass(frozen=True)
class TechnologyMapping:
    raw_key: str
    raw_label: str
    group_key: str
    group_label: str
    family: str
    color: str
    order: int


TECH_MAPPINGS = [
    TechnologyMapping("solar_pv", "Solar PV", "solar", "Solar", "renewable", "#f7b500", 1),
    TechnologyMapping("solar_thermal", "Solar thermal", "solar", "Solar", "renewable", "#ff8a3d", 2),
    TechnologyMapping("wind_onshore", "Wind onshore", "wind", "Wind", "renewable", "#4cc9f0", 3),
    TechnologyMapping("wind_offshore", "Wind offshore", "wind", "Wind", "renewable", "#70d6ff", 4),
    TechnologyMapping("nuclear", "Nuclear", "nuclear", "Nuclear", "nuclear", "#b8f36b", 5),
    TechnologyMapping("hydro_reservoir", "Hydro reservoir", "hydro", "Hydro", "renewable", "#2f80ed", 6),
    TechnologyMapping("hydro_run_of_river", "Hydro run-of-river", "hydro", "Hydro", "renewable", "#69a8ff", 7),
    TechnologyMapping("pumped_hydro_generation", "Pumped hydro generation", "pumped_hydro_generation", "Pumped hydro generation", "storage", "#34d399", 8),
    TechnologyMapping("pumped_hydro_consumption", "Pumped hydro consumption", "pumped_hydro_consumption", "Pumped hydro consumption", "storage", "#0f766e", 9),
    TechnologyMapping("combined_cycle", "Combined cycle", "natural_gas", "Natural gas", "non_renewable", "#ff6b6b", 10),
    TechnologyMapping("cogeneration", "Cogeneration", "natural_gas", "Natural gas", "non_renewable", "#ff8f6b", 11),
    TechnologyMapping("gas_peaker", "Gas peaker", "natural_gas", "Natural gas", "non_renewable", "#ffb26b", 12),
    TechnologyMapping("oil", "Oil", "oil", "Oil", "non_renewable", "#c084fc", 13),
    TechnologyMapping("coal", "Coal", "coal", "Coal", "non_renewable", "#7c6f64", 14),
    TechnologyMapping("battery_discharge", "Battery discharge", "batteries", "Batteries", "storage", "#22c55e", 15),
    TechnologyMapping("battery_charge", "Battery charge", "batteries_charge", "Battery charging", "storage", "#166534", 16),
    TechnologyMapping("biomass", "Biomass", "other_renewables", "Other renewables", "renewable", "#f59e0b", 17),
    TechnologyMapping("waste_renewable", "Renewable waste", "other_renewables", "Other renewables", "renewable", "#ffd166", 18),
    TechnologyMapping("waste_non_renewable", "Non-renewable waste", "other_non_renewables", "Other non-renewables", "non_renewable", "#94a3b8", 19),
    TechnologyMapping("net_imports", "Net imports", "international_transfers", "International transfers", "interconnection", "#38bdf8", 20),
]

RAW_TO_GROUP = {mapping.raw_key: mapping.group_key for mapping in TECH_MAPPINGS}
RAW_TO_LABEL = {mapping.raw_key: mapping.raw_label for mapping in TECH_MAPPINGS}
GROUP_META = {}
for mapping in TECH_MAPPINGS:
    GROUP_META.setdefault(
        mapping.group_key,
        {
            "group_key": mapping.group_key,
            "group_label": mapping.group_label,
            "family": mapping.family,
            "color": mapping.color,
            "order": mapping.order,
        },
    )


def _month_range(start: date, end: date) -> list[date]:
    months: list[date] = []
    current = date(start.year, start.month, 1)
    while current <= end:
        months.append(current)
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
    return months


def _sin(value: float, amplitude: float, phase: float = 0.0) -> float:
    return amplitude * math.sin(value + phase)


def _round(value: float) -> float:
    return round(value, 2)


def _monthly_generation(period: date) -> dict[str, float]:
    seasonal = math.tau * ((period.month - 1) / 12)
    year_index = period.year - 2019
    demand = 20500 + year_index * 380 + _sin(seasonal, 1400, -0.8)
    solar = 1200 + year_index * 280 + _sin(seasonal, 850, -1.3)
    solar_thermal = 130 + year_index * 8 + _sin(seasonal, 75, -1.0)
    wind = 4300 + _sin(seasonal, 980, 0.8) + year_index * 120
    wind_offshore = max(0, (year_index - 3) * 20 + _sin(seasonal, 8, 0.4))
    nuclear = 4700 + _sin(seasonal, 90, 0.5)
    hydro = 2100 + _sin(seasonal, 700, 1.8) + _sin(year_index, 240, 0.1)
    hydro_ror = 620 + _sin(seasonal, 160, 2.2)
    pumped_gen = 260 + _sin(seasonal, 80, 0.9)
    pumped_cons = -(310 + _sin(seasonal, 110, -0.2))
    battery_discharge = max(0, (year_index - 2) * 45 + 20 + _sin(seasonal, 22, 0.3))
    battery_charge = -max(0, (year_index - 2) * 32 + 15 + _sin(seasonal, 15, 0.6))
    biomass = 640 + year_index * 14 + _sin(seasonal, 40, 0.5)
    waste_renew = 190 + _sin(seasonal, 12, 1.1)
    waste_non = 145 + _sin(seasonal, 8, -0.7)
    coal = max(55, 920 - year_index * 130 + _sin(seasonal, 130, 0.2))
    oil = max(35, 160 - year_index * 9 + _sin(seasonal, 18, -0.9))
    non_dispatchable = (
        solar
        + solar_thermal
        + wind
        + wind_offshore
        + nuclear
        + hydro
        + hydro_ror
        + pumped_gen
        + biomass
        + waste_renew
        + waste_non
        + coal
        + oil
        + battery_discharge
        + pumped_cons
        + battery_charge
    )
    target_net_imports = 210 + _sin(seasonal, 540, -0.4) + _sin(year_index * 0.8, 120, 0.3)
    gas = max(1400, demand - non_dispatchable - target_net_imports)
    cogeneration = gas * 0.22
    peaker = gas * 0.08
    combined_cycle = gas - cogeneration - peaker
    net_imports = demand - (
        solar
        + solar_thermal
        + wind
        + wind_offshore
        + nuclear
        + hydro
        + hydro_ror
        + pumped_gen
        + pumped_cons
        + combined_cycle
        + cogeneration
        + peaker
        + oil
        + coal
        + battery_discharge
        + battery_charge
        + biomass
        + waste_renew
        + waste_non
    )
    return {
        "demand_gwh": _round(demand),
        "adjusted_demand_gwh": _round(demand * (0.985 + year_index * 0.0015)),
        "scheduled_demand_gwh": _round(demand * 1.012),
        "solar_pv": _round(solar),
        "solar_thermal": _round(solar_thermal),
        "wind_onshore": _round(wind),
        "wind_offshore": _round(max(0, wind_offshore)),
        "nuclear": _round(nuclear),
        "hydro_reservoir": _round(hydro),
        "hydro_run_of_river": _round(hydro_ror),
        "pumped_hydro_generation": _round(pumped_gen),
        "pumped_hydro_consumption": _round(pumped_cons),
        "combined_cycle": _round(combined_cycle),
        "cogeneration": _round(cogeneration),
        "gas_peaker": _round(peaker),
        "oil": _round(oil),
        "coal": _round(coal),
        "battery_discharge": _round(battery_discharge),
        "battery_charge": _round(battery_charge),
        "biomass": _round(biomass),
        "waste_renewable": _round(waste_renew),
        "waste_non_renewable": _round(waste_non),
        "net_imports": _round(net_imports),
    }


def _exchange_rows(period: date, net_imports: float) -> list[dict[str, Any]]:
    countries = ["France", "Portugal", "Morocco", "Andorra"]
    seasonal = math.tau * ((period.month - 1) / 12)
    raw_weights = [
        0.46 + 0.06 * math.sin(seasonal + 0.2),
        0.34 + 0.05 * math.sin(seasonal + 2.1),
        0.15 + 0.04 * math.sin(seasonal + 4.0),
        0.05 + 0.02 * math.sin(seasonal + 1.2),
    ]
    total_weight = sum(raw_weights)
    weights = [weight / total_weight for weight in raw_weights]
    rows = []
    for country, weight in zip(countries, weights):
        net = net_imports * weight
        if net >= 0:
            imports = net * 1.18
            exports = imports - net
        else:
            exports = abs(net) * 1.22
            imports = exports + net
        rows.append(
            {
                "period": period.isoformat(),
                "country": country,
                "imports_gwh": _round(max(0, imports)),
                "exports_gwh": _round(max(0, exports)),
                "net_imports_gwh": _round(net),
            }
        )
    return rows


def _capacity_rows(year: int) -> list[dict[str, Any]]:
    year_index = year - 2019
    values = {
        "solar": 10000 + year_index * 2400,
        "wind": 25000 + year_index * 700,
        "nuclear": 7100,
        "hydro": 17000 + year_index * 80,
        "pumped_hydro_generation": 6300,
        "natural_gas": 26500 - year_index * 120,
        "coal": max(300, 5400 - year_index * 850),
        "oil": 2800 - year_index * 110,
        "batteries": max(40, year_index * 250),
        "other_renewables": 2500 + year_index * 100,
        "other_non_renewables": 900 - year_index * 40,
        "international_transfers": 4200 + year_index * 120,
    }
    return [
        {"period": f"{year}-01-01", "technology_key": key, "mw": _round(value)}
        for key, value in values.items()
    ]


def _emissions_rows(period: date, monthly: dict[str, float]) -> list[dict[str, Any]]:
    factors = {
        "natural_gas": 0.36,
        "coal": 0.82,
        "oil": 0.71,
        "other_non_renewables": 0.18,
    }
    grouped = {
        "natural_gas": monthly["combined_cycle"] + monthly["cogeneration"] + monthly["gas_peaker"],
        "coal": monthly["coal"],
        "oil": monthly["oil"],
        "other_non_renewables": monthly["waste_non_renewable"],
    }
    total_emissions = sum(grouped[key] * factors[key] for key in grouped)
    demand = monthly["demand_gwh"]
    rows = [
        {
            "period": period.isoformat(),
            "technology_key": key,
            "tco2eq": _round(grouped[key] * factors[key] * 1000),
            "intensity_tco2_per_mwh": _round(factors[key]),
        }
        for key in grouped
    ]
    rows.append(
        {
            "period": period.isoformat(),
            "technology_key": "system_total",
            "tco2eq": _round(total_emissions * 1000),
            "intensity_tco2_per_mwh": _round(total_emissions / max(demand, 1)),
        }
    )
    return rows


def _hourly_rows(start: datetime, end: datetime) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    generation_rows: list[dict[str, Any]] = []
    marginal_rows: list[dict[str, Any]] = []
    current = start
    while current <= end:
        day_of_year = current.timetuple().tm_yday
        seasonal = math.tau * (day_of_year / 365)
        solar_shape = max(0.0, math.sin((current.hour - 6) / 12 * math.pi))
        wind_shape = 0.55 + 0.18 * math.sin((current.hour + 3) / 24 * math.tau)
        demand_mwh = 23600 + 4700 * (0.5 + 0.5 * math.sin((current.hour - 7) / 24 * math.tau)) + _sin(seasonal, 2100, -0.6)
        solar = max(0, 12000 + (current.year - 2024) * 900) * solar_shape * (1.0 + 0.42 * math.sin(seasonal - 1.1))
        wind = 18200 * wind_shape * (1.0 + 0.18 * math.sin(seasonal + 0.8))
        nuclear = 5800
        hydro = 1950 + 260 * math.sin(seasonal + 1.7)
        pumped_gen = 280 if current.hour in {8, 9, 20, 21} else 120
        pumped_cons = 340 if current.hour in {2, 3, 4, 14} else 90
        biomass = 780
        batteries = 160 if current.hour in {19, 20, 21} else 45
        battery_charge = 100 if current.hour in {12, 13, 14} else 30
        coal = max(40, 220 - (current.year - 2024) * 90)
        oil = 55
        non_dispatchable = (
            solar
            + wind
            + nuclear
            + hydro
            + pumped_gen
            + biomass
            + batteries
            + coal
            + oil
            - pumped_cons
            - battery_charge
        )
        gas = max(1400, demand_mwh - non_dispatchable - 180)
        cogeneration = gas * 0.18
        imports = demand_mwh - (
            solar
            + wind
            + nuclear
            + hydro
            + pumped_gen
            - pumped_cons
            + gas
            + coal
            + oil
            + batteries
            - battery_charge
            + biomass
        )
        rows = {
            "solar": solar,
            "wind": wind,
            "nuclear": nuclear,
            "hydro": hydro,
            "pumped_hydro_generation": pumped_gen,
            "pumped_hydro_consumption": -pumped_cons,
            "natural_gas": gas,
            "coal": coal,
            "oil": oil,
            "batteries": batteries,
            "batteries_charge": -battery_charge,
            "other_renewables": biomass,
            "international_transfers": imports,
        }
        for technology_key, value in rows.items():
            generation_rows.append(
                {
                    "timestamp": current.isoformat(),
                    "technology_key": technology_key,
                    "value_mwh": _round(value),
                    "demand_mwh": _round(demand_mwh),
                }
            )
        if current <= MARGINAL_CUTOFF:
            if solar + wind > demand_mwh * 0.72:
                tech = "Hydro"
            elif gas > 6500:
                tech = "Combined cycle"
            elif current.hour in {7, 8, 19, 20, 21}:
                tech = "Combined cycle"
            elif hydro > 2200:
                tech = "Hydro"
            else:
                tech = "Interconnections"
            marginal_rows.append(
                {
                    "timestamp": current.isoformat(),
                    "technology_label": tech,
                    "availability_status": "available",
                }
            )
        current += timedelta(hours=1)
    return generation_rows, marginal_rows


def build_store() -> dict[str, Any]:
    months = _month_range(date(2019, 1, 1), date(2026, 3, 1))
    generation_period: list[dict[str, Any]] = []
    demand_period: list[dict[str, Any]] = []
    exchange_period: list[dict[str, Any]] = []
    balance_period: list[dict[str, Any]] = []
    emissions_period: list[dict[str, Any]] = []
    capacity_period: list[dict[str, Any]] = []

    for period in months:
        monthly = _monthly_generation(period)
        demand_period.append(
            {
                "period": period.isoformat(),
                "demand_gwh": monthly["demand_gwh"],
                "adjusted_demand_gwh": monthly["adjusted_demand_gwh"],
                "scheduled_demand_gwh": monthly["scheduled_demand_gwh"],
            }
        )
        demand = monthly["demand_gwh"]
        positive_generation = 0.0
        for raw_key, value in monthly.items():
            if raw_key.endswith("_gwh"):
                continue
            generation_period.append(
                {
                    "period": period.isoformat(),
                    "raw_key": raw_key,
                    "raw_label": RAW_TO_LABEL[raw_key],
                    "group_key": RAW_TO_GROUP[raw_key],
                    "value_gwh": _round(value),
                    "pct_generation": 0.0,
                    "pct_demand": _round((value / demand) * 100),
                }
            )
            if value > 0:
                positive_generation += value
        for row in generation_period[-len(TECH_MAPPINGS) :]:
            row["pct_generation"] = _round((row["value_gwh"] / max(positive_generation, 1)) * 100)
        exchange_period.extend(_exchange_rows(period, monthly["net_imports"]))
        balance_period.append(
            {
                "period": period.isoformat(),
                "generation_gwh": _round(positive_generation),
                "demand_gwh": demand,
                "pumped_storage_generation_gwh": monthly["pumped_hydro_generation"],
                "pumped_storage_consumption_gwh": abs(monthly["pumped_hydro_consumption"]),
                "battery_discharge_gwh": monthly["battery_discharge"],
                "battery_charge_gwh": abs(monthly["battery_charge"]),
                "exchange_balance_gwh": monthly["net_imports"],
                "losses_gwh": _round(demand * 0.021),
            }
        )
        emissions_period.extend(_emissions_rows(period, monthly))

    for year in range(2019, 2027):
        capacity_period.extend(_capacity_rows(year))

    hourly_generation, marginal_rows = _hourly_rows(datetime(2024, 1, 1, 0, 0), datetime(2025, 3, 18, 23, 0))

    return {
        "metadata": {
            "title": "Spain Electricity Dashboard",
            "subtitle": "Sample local analytics store wired for REE/OMIE-style exploration",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "marginal_cutoff": MARGINAL_CUTOFF.isoformat(),
            "available_years": list(range(2019, 2027)),
            "available_modules": {
                "generation": {"start": "2019-01-01", "end": "2026-03-01"},
                "demand": {"start": "2019-01-01", "end": "2026-03-01"},
                "exchanges": {"start": "2019-01-01", "end": "2026-03-01"},
                "capacity": {"start": "2019-01-01", "end": "2026-01-01"},
                "emissions": {"start": "2019-01-01", "end": "2026-03-01"},
                "hourly_stats": {"start": "2024-01-01T00:00:00", "end": "2025-03-18T23:00:00"},
                "marginal_technology": {"start": "2024-01-01T00:00:00", "end": MARGINAL_CUTOFF.isoformat()},
            },
            "sources": [
                {
                    "name": "REE apidatos / datos",
                    "description": "Generation, demand, exchanges, balance, capacity, and emissions inspired schema.",
                },
                {
                    "name": "OMIE market results",
                    "description": "Hourly marginal-price-setting technology through 2025-03-18 only.",
                },
            ],
        },
        "technology_mappings": [asdict(mapping) for mapping in TECH_MAPPINGS],
        "technology_groups": list(GROUP_META.values()),
        "generation_period": generation_period,
        "demand_period": demand_period,
        "exchange_period": exchange_period,
        "balance_period": balance_period,
        "capacity_period": capacity_period,
        "emissions_period": emissions_period,
        "hourly_generation": hourly_generation,
        "marginal_technology_hour": marginal_rows,
    }


def ensure_store() -> Path:
    if not STORE_PATH.exists():
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STORE_PATH.write_text(json.dumps(build_store(), indent=2), encoding="utf-8")
    return STORE_PATH
