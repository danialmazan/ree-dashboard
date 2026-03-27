import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  fetchBalance,
  fetchCapacity,
  fetchCoverageStats,
  fetchEmissions,
  fetchExchanges,
  fetchGeneration,
  fetchGenerationDetail,
  fetchMarginalTechnology,
  fetchMetadata
} from "./api";
import { ChartShell } from "./components/ChartShell";
import { Sidebar } from "./components/Sidebar";
import type {
  BalanceRow,
  CapacityRow,
  CoverageResponse,
  EmissionsRow,
  ExchangeRow,
  GenerationRow,
  MarginalResponse,
  MetadataResponse,
  MetricMode,
  PeriodMode,
  TechnologyView
} from "./types";

const defaultMetadata: MetadataResponse = {
  title: "REE Grid Atlas",
  subtitle: "",
  updated_at: "",
  marginal_cutoff: "2025-03-18T23:00:00",
  available_years: [],
  available_modules: {},
  technology_groups: [],
  technology_mappings: [],
  sources: []
};

function reshapeGeneration(rows: GenerationRow[], metricMode: MetricMode) {
  const map = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const period = row.period.slice(0, 7);
    if (!map.has(period)) {
      map.set(period, { period });
    }
    const item = map.get(period)!;
    item[row.technology_key] =
      metricMode === "energy"
        ? row.value_gwh
        : metricMode === "pct_generation"
          ? row.pct_generation
          : row.pct_demand;
  }
  return Array.from(map.values());
}

function reshapeExchanges(rows: ExchangeRow[]) {
  const map = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const period = row.period.slice(0, 7);
    if (!map.has(period)) {
      map.set(period, { period });
    }
    map.get(period)![row.country] = row.value_gwh;
  }
  return Array.from(map.values());
}

function colorForKey(metadata: MetadataResponse, key: string) {
  return (
    metadata.technology_groups.find((group) => group.group_key === key)?.color ??
    metadata.technology_mappings.find((mapping) => mapping.raw_key === key)?.color ??
    "#8ba3ff"
  );
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function tickLabel(value: number, unit: string) {
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function preciseTickLabel(value: number, unit: string, digits = 3) {
  return `${formatNumber(value, digits)}${unit ? ` ${unit}` : ""}`;
}

function monthKeyToDateRange(monthKey: string, endOfMonth = false) {
  const [year, month] = monthKey.split("-").map(Number);
  const day = endOfMonth ? new Date(year, month, 0).getDate() : 1;
  const hour = endOfMonth ? 23 : 0;
  return `${monthKey}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`;
}

function periodKeyFromIso(value: string) {
  return value.slice(0, 7);
}

function inMonthRange(value: string, fromMonth: string, toMonth: string) {
  return value >= fromMonth && value <= toMonth;
}

function rollingAverage(data: Array<Record<string, string | number>>, keys: string[], windowSize = 12) {
  return data.map((row, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = data.slice(start, index + 1);
    const averaged: Record<string, string | number> = { period: row.period as string };
    for (const key of keys) {
      const total = window.reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
      averaged[key] = total / window.length;
    }
    return averaged;
  });
}

function hoursInMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate() * 24;
}

function monthSequence(fromMonth: string, toMonth: string) {
  const result: string[] = [];
  let current = fromMonth;
  while (current <= toMonth) {
    result.push(current);
    const [year, month] = current.split("-").map(Number);
    current =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return result;
}

function marginalMonthlyShares(rows: MarginalResponse["rows"]) {
  const buckets = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const period = row.timestamp.slice(0, 7);
    if (!buckets.has(period)) {
      buckets.set(period, {});
    }
    const bucket = buckets.get(period)!;
    const key =
      row.availability_status === "available"
        ? (row.technology_label ?? "Unknown")
        : "Source unavailable";
    bucket[key] = (bucket[key] ?? 0) + 1;
    bucket.total = (bucket.total ?? 0) + 1;
  }
  return Array.from(buckets.entries()).map(([period, values]) => {
    const total = values.total || 1;
    const row: Record<string, string | number> = { period };
    Object.entries(values).forEach(([key, value]) => {
      if (key === "total") {
        return;
      }
      row[key] = (value / total) * 100;
    });
    return row;
  });
}

function averageByYear(rows: GenerationRow[], view: TechnologyView, metadata: MetadataResponse) {
  const rawToFamily = Object.fromEntries(
    metadata.technology_mappings.map((mapping) => [mapping.raw_key, mapping.family])
  );
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const year = row.period.slice(0, 4);
    const family = view === "normalized"
      ? metadata.technology_groups.find((group) => group.group_key === row.technology_key)?.family
      : rawToFamily[row.technology_key];
    if (family) {
      grouped.set(family, (grouped.get(family) ?? 0) + row.value_gwh);
    }
    grouped.set("nuclear", (grouped.get("nuclear") ?? 0) + (row.technology_key === "nuclear" ? row.value_gwh : 0));
    grouped.set("total", (grouped.get("total") ?? 0) + row.value_gwh);
  });
  return grouped;
}

function App() {
  const [metadata, setMetadata] = useState<MetadataResponse>(defaultMetadata);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [metricMode, setMetricMode] = useState<MetricMode>("energy");
  const [technologyView, setTechnologyView] = useState<TechnologyView>("normalized");
  const [generation, setGeneration] = useState<GenerationRow[]>([]);
  const [generationDetail, setGenerationDetail] = useState<GenerationRow[]>([]);
  const [exchangeNetRows, setExchangeNetRows] = useState<ExchangeRow[]>([]);
  const [exchangeImportRows, setExchangeImportRows] = useState<ExchangeRow[]>([]);
  const [exchangeExportRows, setExchangeExportRows] = useState<ExchangeRow[]>([]);
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [emissions, setEmissions] = useState<EmissionsRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [marginal, setMarginal] = useState<MarginalResponse | null>(null);
  const [generationSelectedKeys, setGenerationSelectedKeys] = useState<string[]>([
    "solar",
    "wind",
    "nuclear",
    "natural_gas"
  ]);
  const [coverageSelectedKeys, setCoverageSelectedKeys] = useState<string[]>(["solar", "wind"]);
  const [interconnectorMode, setInterconnectorMode] = useState<"net" | "imports_exports">("net");
  const [interconnectorMetric, setInterconnectorMetric] = useState<"gwh" | "pct">("gwh");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["France", "Portugal", "Morocco", "Andorra"]);
  const [threshold, setThreshold] = useState(40);
  const [thresholdInput, setThresholdInput] = useState("40");
  const [activeSection, setActiveSection] = useState("generation");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generationFromMonth, setGenerationFromMonth] = useState("2019-01");
  const [generationToMonth, setGenerationToMonth] = useState("2026-03");
  const [interconnectorFromMonth, setInterconnectorFromMonth] = useState("2019-01");
  const [interconnectorToMonth, setInterconnectorToMonth] = useState("2026-03");
  const [coverageFromMonth, setCoverageFromMonth] = useState("2019-01");
  const [coverageToMonth, setCoverageToMonth] = useState("2026-03");
  const [marginalFromMonth, setMarginalFromMonth] = useState("2019-01");
  const [marginalToMonth, setMarginalToMonth] = useState("2026-03");
  const [systemFromMonth, setSystemFromMonth] = useState("2019-01");
  const [systemToMonth, setSystemToMonth] = useState("2026-03");

  const coverageRangeStart = monthKeyToDateRange(coverageFromMonth, false);
  const coverageRangeEnd = monthKeyToDateRange(coverageToMonth, true);
  const marginalRangeStart = monthKeyToDateRange(marginalFromMonth, false);
  const marginalRangeEnd = monthKeyToDateRange(marginalToMonth, true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          metadataResponse,
          generationResponse,
          detailResponse,
          exchangeNetResponse,
          exchangeImportsResponse,
          exchangeExportsResponse,
          balanceResponse,
          capacityResponse,
          emissionsResponse,
          coverageResponse,
          marginalResponse
        ] = await Promise.all([
          fetchMetadata(),
          fetchGeneration("month", technologyView),
          fetchGenerationDetail(technologyView, generationSelectedKeys),
          fetchExchanges("month", "net"),
          fetchExchanges("month", "imports"),
          fetchExchanges("month", "exports"),
          fetchBalance("month"),
          fetchCapacity(),
          fetchEmissions("month"),
          fetchCoverageStats(coverageSelectedKeys, threshold, coverageRangeStart, coverageRangeEnd),
          fetchMarginalTechnology(marginalRangeStart, marginalRangeEnd)
        ]);
        setMetadata(metadataResponse);
        setGeneration(generationResponse.rows);
        setGenerationDetail(detailResponse.monthly);
        setExchangeNetRows(exchangeNetResponse.rows);
        setExchangeImportRows(exchangeImportsResponse.rows);
        setExchangeExportRows(exchangeExportsResponse.rows);
        setBalance(balanceResponse.rows);
        setCapacity(capacityResponse.rows);
        setEmissions(emissionsResponse.rows);
        setCoverage(coverageResponse);
        setMarginal(marginalResponse);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unknown API error";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [
    technologyView,
    generationSelectedKeys,
    coverageSelectedKeys,
    threshold,
    coverageRangeStart,
    coverageRangeEnd,
    marginalRangeStart,
    marginalRangeEnd
  ]);

  const generationOptions = useMemo(() => {
    return technologyView === "normalized"
      ? [...metadata.technology_groups].sort((a, b) => a.order - b.order)
      : metadata.technology_mappings.map((mapping) => ({
          group_key: mapping.raw_key,
          group_label: mapping.raw_label,
          family: mapping.family,
          color: mapping.color,
          order: mapping.order
        }));
  }, [metadata, technologyView]);

  useEffect(() => {
    if (!generationOptions.length) {
      return;
    }
    const allowed = new Set(generationOptions.map((option) => option.group_key));
    setGenerationSelectedKeys((current) => {
      const filtered = current.filter((key) => allowed.has(key));
      if (filtered.length > 0) {
        return arraysEqual(current, filtered) ? current : filtered;
      }
      const fallback = generationOptions.slice(0, 4).map((option) => option.group_key);
      return arraysEqual(current, fallback) ? current : fallback;
    });
  }, [generationOptions]);

  useEffect(() => {
    if (!metadata.technology_groups.length) {
      return;
    }
    const allowed = new Set(metadata.technology_groups.map((option) => option.group_key));
    setCoverageSelectedKeys((current) => {
      const filtered = current.filter((key) => allowed.has(key));
      if (filtered.length > 0) {
        return arraysEqual(current, filtered) ? current : filtered;
      }
      const fallback = ["solar", "wind"];
      return arraysEqual(current, fallback) ? current : fallback;
    });
  }, [metadata.technology_groups]);

  const generationRows = useMemo(
    () =>
      generation.filter(
        (row) =>
          generationSelectedKeys.includes(row.technology_key) &&
          inMonthRange(periodKeyFromIso(row.period), generationFromMonth, generationToMonth)
      ),
    [generation, generationSelectedKeys, generationFromMonth, generationToMonth]
  );
  const detailRows = useMemo(
    () =>
      generationDetail.filter(
        (row) =>
          generationSelectedKeys.includes(row.technology_key) &&
          inMonthRange(periodKeyFromIso(row.period), generationFromMonth, generationToMonth)
      ),
    [generationDetail, generationSelectedKeys, generationFromMonth, generationToMonth]
  );
  const generationChartBase = useMemo(() => reshapeGeneration(generationRows, metricMode), [generationRows, metricMode]);
  const generationChartData = useMemo(
    () => (periodMode === "month" ? generationChartBase : rollingAverage(generationChartBase, generationSelectedKeys)),
    [generationChartBase, periodMode, generationSelectedKeys]
  );
  const detailChartData = useMemo(
    () => rollingAverage(reshapeGeneration(detailRows, "energy"), generationSelectedKeys),
    [detailRows, generationSelectedKeys]
  );
  const exchangeChartData = useMemo(() => {
    const netRows = exchangeNetRows.filter(
      (row) =>
        selectedCountries.includes(row.country) &&
        inMonthRange(periodKeyFromIso(row.period), interconnectorFromMonth, interconnectorToMonth)
    );
    const importRows = exchangeImportRows.filter(
      (row) =>
        selectedCountries.includes(row.country) &&
        inMonthRange(periodKeyFromIso(row.period), interconnectorFromMonth, interconnectorToMonth)
    );
    const exportRows = exchangeExportRows.filter(
      (row) =>
        selectedCountries.includes(row.country) &&
        inMonthRange(periodKeyFromIso(row.period), interconnectorFromMonth, interconnectorToMonth)
    );
    const months = new Map<string, Record<string, string | number>>();
    const ensureMonth = (period: string) => {
      const key = period.slice(0, 7);
      if (!months.has(key)) {
        months.set(key, { period: key, totalNet: 0 });
      }
      return months.get(key)!;
    };
    if (interconnectorMode === "net") {
      netRows.forEach((row) => {
        const month = ensureMonth(row.period);
        month[row.country] = row.value_gwh;
        month.totalNet = Number(month.totalNet) + row.value_gwh;
      });
    } else {
      importRows.forEach((row) => {
        const month = ensureMonth(row.period);
        month[`${row.country} imports`] = row.value_gwh;
        month.totalNet = Number(month.totalNet) + row.value_gwh;
      });
      exportRows.forEach((row) => {
        const month = ensureMonth(row.period);
        month[`${row.country} exports`] = -row.value_gwh;
        month.totalNet = Number(month.totalNet) - row.value_gwh;
      });
    }
    const rows = Array.from(months.values()).sort((left, right) => String(left.period).localeCompare(String(right.period)));
    if (interconnectorMetric === "gwh") {
      return rows;
    }
    return rows.map((row) => {
      const converted = { ...row };
      const denominator = Object.entries(row)
        .filter(([key]) => key !== "period")
        .reduce((sum, [, value]) => sum + Math.abs(Number(value)), 0);
      Object.keys(converted).forEach((key) => {
        if (key === "period") {
          return;
        }
        converted[key] = denominator ? (Number(converted[key]) / denominator) * 100 : 0;
      });
      return converted;
    });
  }, [
    exchangeNetRows,
    exchangeImportRows,
    exchangeExportRows,
    interconnectorMode,
    interconnectorMetric,
    selectedCountries,
    interconnectorFromMonth,
    interconnectorToMonth
  ]);
  const balanceChartData = useMemo(
    () =>
      balance
        .filter((row) => inMonthRange(periodKeyFromIso(row.period), generationFromMonth, generationToMonth))
        .map((row) => ({
        period: row.period.slice(0, 7),
        importGap: row.exchange_balance_gwh
      })),
    [balance, generationFromMonth, generationToMonth]
  );
  const emissionsChartData = useMemo(
    () =>
      emissions
        .filter((row) => row.technology_key === "system_total")
        .filter((row) => inMonthRange(periodKeyFromIso(row.period), systemFromMonth, systemToMonth))
        .map((row) => ({
          period: row.period.slice(0, 7),
          intensity: row.intensity_tco2_per_mwh
        })),
    [emissions, systemFromMonth, systemToMonth]
  );
  const latestCapacity = useMemo(() => {
    const latestPeriod = capacity.length ? capacity[capacity.length - 1].period : undefined;
    return capacity.filter((row) => row.period === latestPeriod);
  }, [capacity]);
  const marginalChartData = useMemo(() => marginalMonthlyShares(marginal?.rows ?? []), [marginal]);
  const marginalSeries = useMemo(() => {
    const keys = new Set<string>();
    marginalChartData.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== "period") {
          keys.add(key);
        }
      });
    });
    const preferred = ["Combined cycle", "Hydro", "Interconnections", "Source unavailable"];
    return Array.from(keys).sort((left, right) => {
      const leftIndex = preferred.indexOf(left);
      const rightIndex = preferred.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
      }
      if (leftIndex === -1) {
        return 1;
      }
      if (rightIndex === -1) {
        return -1;
      }
      return leftIndex - rightIndex;
    });
  }, [marginalChartData]);

  function toggleGenerationTechnology(key: string) {
    setGenerationSelectedKeys((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }

  function toggleCoverageTechnology(key: string) {
    setCoverageSelectedKeys((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }

  function toggleCountry(country: string) {
    setSelectedCountries((current) => {
      if (current.includes(country)) {
        return current.length === 1 ? current : current.filter((item) => item !== country);
      }
      return [...current, country];
    });
  }

  function applyGenerationPreset(preset: "renewables" | "non_renewables" | "nuclear") {
    const presetGroups: Record<string, string[]> = {
      renewables: [
        "solar",
        "wind",
        "hydro",
        "pumped_hydro_generation",
        "pumped_hydro_consumption",
        "batteries",
        "batteries_charge",
        "other_renewables"
      ],
      non_renewables: ["natural_gas", "oil", "coal", "other_non_renewables"],
      nuclear: ["nuclear"],
      international_transfers: ["international_transfers"]
    } as const;
    const allowedGroups = new Set(presetGroups[preset]);
    const options = generationOptions.filter((option) => {
      if (technologyView === "normalized") {
        return allowedGroups.has(option.group_key);
      }
      const mapping = metadata.technology_mappings.find((item) => item.raw_key === option.group_key);
      return mapping ? allowedGroups.has(mapping.group_key) : false;
    });
    setGenerationSelectedKeys(options.map((option) => option.group_key));
  }

  const activeSectionLabel = {
    generation: "National generation mix",
    interconnectors: "Cross-border flows",
    coverage: "Coverage threshold statistics",
    marginal: "Marginal-price-setting technologies",
    system: "Capacity and emissions context"
  }[activeSection];
  const activeSectionCopy = {
    generation: "Generation mix, rolling source trends, and the role of imports in balancing demand.",
    interconnectors: "Monthly cross-border flows by country, either as net positions or split into imports and exports.",
    coverage: "Share of hourly intervals in which the selected sources exceed the chosen demand threshold. Hourly sample coverage begins in January 2024.",
    marginal: "Monthly distribution of the technologies or interconnections that set the marginal market price.",
    system: "Installed capacity scale and system emissions intensity over the selected time window."
  }[activeSection];

  const metricUnit = metricMode === "energy" ? "GWh" : "%";
  const interconnectorUnit = interconnectorMetric === "gwh" ? "GWh" : "%";
  const chartMargin = { top: 28, right: 32, left: 36, bottom: 8 };
  const countryColors: Record<string, string> = {
    France: "#1d4ed8",
    Morocco: "#dc2626",
    Portugal: "#16a34a",
    Andorra: "#facc15"
  };
  const marginalColors: Record<string, string> = {
    "Combined cycle": "#ff7b72",
    Hydro: "#3b82f6",
    Interconnections: "#facc15",
    "Source unavailable": "#64748b"
  };
  const capacityMax = latestCapacity.reduce((max, row) => Math.max(max, row.mw), 0);
  const coverageChartData = useMemo(
    () => {
      const actual = new Map(
        (coverage?.breakdown ?? []).map((row) => [row.period, (row.hours / hoursInMonth(row.period)) * 100])
      );
      return monthSequence(coverageFromMonth, coverageToMonth).map((period) => ({
        period,
        share: actual.get(period) ?? 0
      }));
    },
    [coverage, coverageFromMonth, coverageToMonth]
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <Sidebar activeSection={activeSection} onSelect={setActiveSection} />
      <main className="main-stage">
        <motion.header
          className="stage-header"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <p className="eyebrow">Live workspace</p>
            <h2>{activeSectionLabel}</h2>
            <p className="lead">{activeSectionCopy}</p>
          </div>
          <div className="toolbar">
            {activeSection === "generation" ? (
              <>
                <label className="month-filter">
                  <span>From</span>
                  <input
                    type="month"
                    value={generationFromMonth}
                    max={generationToMonth}
                    onChange={(event) => setGenerationFromMonth(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>To</span>
                  <input
                    type="month"
                    value={generationToMonth}
                    min={generationFromMonth}
                    onChange={(event) => setGenerationToMonth(event.target.value)}
                  />
                </label>
                <div className="segmented-control">
                  <button className={periodMode === "month" ? "is-active" : ""} onClick={() => setPeriodMode("month")}>
                    Monthly
                  </button>
                  <button className={periodMode === "year" ? "is-active" : ""} onClick={() => setPeriodMode("year")}>
                    12M average
                  </button>
                </div>
                <div className="segmented-control">
                  <button className={metricMode === "energy" ? "is-active" : ""} onClick={() => setMetricMode("energy")}>
                    GWh
                  </button>
                  <button
                    className={metricMode === "pct_generation" ? "is-active" : ""}
                    onClick={() => setMetricMode("pct_generation")}
                  >
                    % generation
                  </button>
                  <button className={metricMode === "pct_demand" ? "is-active" : ""} onClick={() => setMetricMode("pct_demand")}>
                    % demand
                  </button>
                </div>
                <div className="segmented-control">
                  <button
                    className={technologyView === "normalized" ? "is-active" : ""}
                    onClick={() => setTechnologyView("normalized")}
                  >
                    Grouped
                  </button>
                  <button className={technologyView === "raw" ? "is-active" : ""} onClick={() => setTechnologyView("raw")}>
                    Raw
                  </button>
                </div>
              </>
            ) : null}
            {activeSection === "interconnectors" ? (
              <>
                <label className="month-filter">
                  <span>From</span>
                  <input
                    type="month"
                    value={interconnectorFromMonth}
                    max={interconnectorToMonth}
                    onChange={(event) => setInterconnectorFromMonth(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>To</span>
                  <input
                    type="month"
                    value={interconnectorToMonth}
                    min={interconnectorFromMonth}
                    onChange={(event) => setInterconnectorToMonth(event.target.value)}
                  />
                </label>
                <div className="segmented-control">
                  <button className={interconnectorMetric === "gwh" ? "is-active" : ""} onClick={() => setInterconnectorMetric("gwh")}>
                    GWh
                  </button>
                  <button className={interconnectorMetric === "pct" ? "is-active" : ""} onClick={() => setInterconnectorMetric("pct")}>
                    %
                  </button>
                </div>
              </>
            ) : null}
            {activeSection === "coverage" ? (
              <>
                <label className="month-filter">
                  <span>From</span>
                  <input
                    type="month"
                    value={coverageFromMonth}
                    max={coverageToMonth}
                    onChange={(event) => setCoverageFromMonth(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>To</span>
                  <input
                    type="month"
                    value={coverageToMonth}
                    min={coverageFromMonth}
                    onChange={(event) => setCoverageToMonth(event.target.value)}
                  />
                </label>
              </>
            ) : null}
            {activeSection === "marginal" ? (
              <>
                <label className="month-filter">
                  <span>From</span>
                  <input
                    type="month"
                    value={marginalFromMonth}
                    max={marginalToMonth}
                    onChange={(event) => setMarginalFromMonth(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>To</span>
                  <input
                    type="month"
                    value={marginalToMonth}
                    min={marginalFromMonth}
                    onChange={(event) => setMarginalToMonth(event.target.value)}
                  />
                </label>
              </>
            ) : null}
            {activeSection === "system" ? (
              <>
                <label className="month-filter">
                  <span>From</span>
                  <input
                    type="month"
                    value={systemFromMonth}
                    max={systemToMonth}
                    onChange={(event) => setSystemFromMonth(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>To</span>
                  <input
                    type="month"
                    value={systemToMonth}
                    min={systemFromMonth}
                    onChange={(event) => setSystemToMonth(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
        </motion.header>

        {loading ? (
          <div className="loading-state">Loading local analytics store…</div>
        ) : error ? (
          <div className="error-state">
            <h3>Dashboard data is unavailable</h3>
            <p>
              The frontend could not reach the local API. Start the backend, then reload this page.
            </p>
            <pre>{error}</pre>
            <code>cd backend && ./.venv/bin/uvicorn app.main:app --reload</code>
          </div>
        ) : (
          <div className="stage-grid">
            {activeSection === "generation" ? (
              <>
                <ChartShell
                  className="chart-shell-wide"
                  eyebrow="Generation mix"
                  title={periodMode === "month" ? "Monthly generation by selected source" : "12-month average generation by selected source"}
                  copy="National generation mix for the selected technologies and time window."
                >
                  <div className="inline-controls">
                    <div className="segmented-control">
                      <button onClick={() => applyGenerationPreset("renewables")}>Renewables</button>
                      <button onClick={() => applyGenerationPreset("non_renewables")}>Non-renewables</button>
                      <button onClick={() => applyGenerationPreset("nuclear")}>Nuclear</button>
                      <button onClick={() => setGenerationSelectedKeys(["international_transfers"])}>International transfers</button>
                    </div>
                  </div>
                  <section className="selection-rail selection-rail-inline">
                    {generationOptions.map((option) => (
                      <button
                        type="button"
                        key={option.group_key}
                        className={`source-toggle ${generationSelectedKeys.includes(option.group_key) ? "is-active" : ""}`}
                        onClick={() => toggleGenerationTechnology(option.group_key)}
                        style={{ "--source-color": option.color } as CSSProperties}
                      >
                        <span className="source-dot" />
                        {option.group_label}
                      </button>
                    ))}
                  </section>
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={generationChartData} margin={chartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                      <YAxis width={78} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => tickLabel(Number(value), metricUnit)} />
                      <Tooltip
                        formatter={(value: number) => tickLabel(value, metricUnit)}
                        contentStyle={{
                          background: "rgba(6, 12, 24, 0.92)",
                          border: "1px solid rgba(122, 162, 255, 0.24)",
                          borderRadius: 16
                        }}
                      />
                      <Legend />
                      {generationSelectedKeys.map((key) => (
                        <Bar key={key} dataKey={key} stackId="generation" fill={colorForKey(metadata, key)} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartShell>

                <ChartShell
                  className="chart-shell-wide"
                  eyebrow="Selected-source share"
                  title="12-month rolling average generation for selected sources"
                  copy="Rolling 12-month average generation for the selected technologies."
                >
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={detailChartData} margin={chartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                      <YAxis width={78} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => tickLabel(Number(value), "GWh")} />
                      <Tooltip
                        formatter={(value: number) => tickLabel(value, "GWh")}
                        contentStyle={{
                          background: "rgba(6, 12, 24, 0.92)",
                          border: "1px solid rgba(122, 162, 255, 0.24)",
                          borderRadius: 16
                        }}
                      />
                      {generationSelectedKeys.map((key) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={colorForKey(metadata, key)}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartShell>

                <ChartShell
                  eyebrow="Balance"
                  title="Interconnector gap versus domestic balance"
                  copy="Positive values mean international imports were needed to close the gap between demand and generation. Negative values mean net export surplus."
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={balanceChartData} margin={chartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                      <YAxis width={78} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => tickLabel(Number(value), "GWh")} />
                      <Tooltip
                        formatter={(value: number) => tickLabel(value, "GWh")}
                        contentStyle={{
                          background: "rgba(6, 12, 24, 0.92)",
                          border: "1px solid rgba(122, 162, 255, 0.24)",
                          borderRadius: 16
                        }}
                      />
                      <Bar dataKey="importGap" fill="#22c55e" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartShell>
              </>
            ) : null}

            {activeSection === "interconnectors" ? (
              <ChartShell
                eyebrow="Interconnectors"
                title="Monthly interconnector flows by country"
                copy="Net mode shows signed country positions. Imports/exports mode splits inbound and outbound flows while preserving the monthly net total."
              >
              <div className="inline-controls">
                <div className="segmented-control">
                  <button className={interconnectorMode === "net" ? "is-active" : ""} onClick={() => setInterconnectorMode("net")}>
                    Net
                  </button>
                  <button
                    className={interconnectorMode === "imports_exports" ? "is-active" : ""}
                    onClick={() => setInterconnectorMode("imports_exports")}
                  >
                    Imports / exports
                  </button>
                </div>
                <div className="selection-rail selection-rail-inline">
                  {Object.entries(countryColors).map(([country, color]) => (
                    <button
                      key={country}
                      type="button"
                      className={`source-toggle ${selectedCountries.includes(country) ? "is-active" : ""}`}
                      onClick={() => toggleCountry(country)}
                      style={{ "--source-color": color } as CSSProperties}
                    >
                      <span className="source-dot" />
                      {country}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={exchangeChartData} margin={chartMargin}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                  <YAxis width={78} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => tickLabel(Number(value), interconnectorUnit)} />
                  <Tooltip
                    formatter={(value: number) => tickLabel(value, interconnectorUnit)}
                    contentStyle={{
                      background: "rgba(6, 12, 24, 0.92)",
                      border: "1px solid rgba(122, 162, 255, 0.24)",
                      borderRadius: 16
                    }}
                  />
                  <Legend />
                  {interconnectorMode === "net"
                    ? Object.entries(countryColors)
                        .filter(([country]) => selectedCountries.includes(country))
                        .map(([country, color]) => <Bar key={country} dataKey={country} stackId="exchange" fill={color} />)
                    : Object.entries(countryColors)
                        .filter(([country]) => selectedCountries.includes(country))
                        .flatMap(([country, color]) => [
                          <Bar key={`${country}-imports`} dataKey={`${country} imports`} stackId="exchange" fill={color} />,
                          <Bar
                            key={`${country}-exports`}
                            dataKey={`${country} exports`}
                            stackId="exchange"
                            fill={color}
                            fillOpacity={0.45}
                          />
                        ])}
                  <Line type="monotone" dataKey="totalNet" stroke="#f8fafc" dot={false} strokeWidth={2.5} />
                </ComposedChart>
              </ResponsiveContainer>
              </ChartShell>
            ) : null}

            {activeSection === "coverage" ? (
              <ChartShell
                eyebrow="Coverage stats"
                title="Hours where the selected set exceeded the threshold"
                copy="Monthly count and share of hourly intervals in which the selected sources covered at least the chosen share of demand."
              >
              <section className="selection-rail selection-rail-inline">
                {metadata.technology_groups.map((option) => (
                  <button
                    type="button"
                    key={option.group_key}
                    className={`source-toggle ${coverageSelectedKeys.includes(option.group_key) ? "is-active" : ""}`}
                    onClick={() => toggleCoverageTechnology(option.group_key)}
                    style={{ "--source-color": option.color } as CSSProperties}
                  >
                    <span className="source-dot" />
                    {option.group_label}
                  </button>
                ))}
              </section>
              <div className="coverage-topline">
                <div>
                  <span className="big-number">{formatNumber(coverage?.share_matching ?? 0, 1)}%</span>
                  <p>of all hours</p>
                </div>
                <div>
                  <span className="big-number">{integerFormatter.format(coverage?.hours_total ?? 0)}</span>
                  <p>hours in range</p>
                </div>
                <label className="slider-wrap">
                  <span>Threshold</span>
                  <div className="inline-controls">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={thresholdInput}
                      onChange={(event) => setThresholdInput(event.target.value)}
                    />
                    <button type="button" className="apply-button" onClick={() => setThreshold(Number(thresholdInput) || 0)}>
                      Update
                    </button>
                  </div>
                </label>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={coverageChartData} margin={chartMargin}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                  <YAxis width={70} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => tickLabel(Number(value), "%")} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: number) => tickLabel(value, "%")}
                    contentStyle={{
                      background: "rgba(6, 12, 24, 0.92)",
                      border: "1px solid rgba(122, 162, 255, 0.24)",
                      borderRadius: 16
                    }}
                  />
                  <Bar dataKey="share" fill="#9eff8f" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </ChartShell>
            ) : null}

            {activeSection === "marginal" ? (
              <ChartShell
                eyebrow="Marginal technology"
                title="Monthly share of hours setting the marginal price"
                copy="Interconnections means imported offers set the marginal Spanish price in that hour. The chart shows each series as a share of all hours in the month."
              >
              <div className="marginal-note">{marginal?.note}</div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={marginalChartData} margin={chartMargin}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                  <YAxis
                    width={70}
                    stroke="rgba(255,255,255,0.45)"
                    tickFormatter={(value) => tickLabel(Number(value), "%")}
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => tickLabel(value, "%")}
                    contentStyle={{
                      background: "rgba(6, 12, 24, 0.92)",
                      border: "1px solid rgba(122, 162, 255, 0.24)",
                      borderRadius: 16
                    }}
                  />
                  <Legend />
                  {marginalSeries.map((series) => (
                    <Bar
                      key={series}
                      dataKey={series}
                      stackId="marginal"
                      fill={marginalColors[series] ?? "#8ba3ff"}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              </ChartShell>
            ) : null}

            {activeSection === "system" ? (
              <>
                <ChartShell
                  eyebrow="System context"
                  title="Installed capacity snapshot"
                  copy="Relative installed capacity by technology in the latest available year."
                >
                  <div className="mini-table">
                    {latestCapacity.map((row) => (
                      <div key={row.technology_key} className="mini-row">
                        <span>{row.technology_key.replace(/_/g, " ")}</span>
                        <div className="capacity-value">
                          <div className="capacity-bar-track">
                            <div
                              className="capacity-bar-fill"
                              style={{ width: `${(row.mw / Math.max(capacityMax, 1)) * 100}%` }}
                            />
                          </div>
                          <strong>{integerFormatter.format(Math.round(row.mw))} MW</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartShell>
                <ChartShell
                  eyebrow="Emissions intensity"
                  title="System CO2 intensity"
                  copy="Monthly average system intensity, expressed in tonnes of CO2 equivalent per MWh."
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={emissionsChartData} margin={chartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="period" stroke="rgba(255,255,255,0.45)" />
                      <YAxis width={86} stroke="rgba(255,255,255,0.45)" tickFormatter={(value) => preciseTickLabel(Number(value), "tCO2/MWh", 2)} />
                      <Tooltip
                        formatter={(value: number) => preciseTickLabel(value, "tCO2/MWh", 3)}
                        contentStyle={{
                          background: "rgba(6, 12, 24, 0.92)",
                          border: "1px solid rgba(122, 162, 255, 0.24)",
                          borderRadius: 16
                        }}
                      />
                      <Line type="monotone" dataKey="intensity" stroke="#ff8f6b" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartShell>
              </>
            ) : null}

            <section className="sources-footer">
              <p className="eyebrow">Feeds</p>
              <div className="source-list-inline">
                {metadata.sources.map((source) => (
                  <div key={source.name} className="source-footnote">
                    <strong>{source.name}</strong>
                    <span>{source.description}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
