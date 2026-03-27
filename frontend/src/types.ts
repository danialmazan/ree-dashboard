export type PeriodMode = "year" | "month";
export type MetricMode = "energy" | "pct_generation" | "pct_demand";
export type TechnologyView = "normalized" | "raw";

export interface TechnologyGroup {
  group_key: string;
  group_label: string;
  family: string;
  color: string;
  order: number;
}

export interface TechnologyMapping {
  raw_key: string;
  raw_label: string;
  group_key: string;
  group_label: string;
  family: string;
  color: string;
  order: number;
}

export interface MetadataResponse {
  title: string;
  subtitle: string;
  updated_at: string;
  marginal_cutoff: string;
  available_years: number[];
  technology_groups: TechnologyGroup[];
  technology_mappings: TechnologyMapping[];
  available_modules: Record<string, { start: string; end: string }>;
  sources: Array<{ name: string; description: string }>;
}

export interface GenerationRow {
  period: string;
  technology_key: string;
  technology_label: string;
  value_gwh: number;
  pct_generation: number;
  pct_demand: number;
}

export interface ExchangeRow {
  period: string;
  country: string;
  value_gwh: number;
}

export interface BalanceRow {
  period: string;
  generation_gwh: number;
  demand_gwh: number;
  pumped_storage_generation_gwh: number;
  pumped_storage_consumption_gwh: number;
  battery_discharge_gwh: number;
  battery_charge_gwh: number;
  exchange_balance_gwh: number;
  losses_gwh: number;
}

export interface CapacityRow {
  period: string;
  technology_key: string;
  mw: number;
}

export interface EmissionsRow {
  period: string;
  technology_key: string;
  tco2eq: number;
  intensity_tco2_per_mwh: number;
}

export interface CoverageBreakdown {
  period: string;
  hours: number;
}

export interface CoverageResponse {
  source_set: string[];
  threshold: number;
  year: number | null;
  month: number | null;
  hours_total: number;
  hours_matching: number;
  share_matching: number;
  breakdown: CoverageBreakdown[];
}

export interface MarginalRow {
  timestamp: string;
  technology_label: string | null;
  availability_status: "available" | "not_available_from_source" | "out_of_range";
}

export interface MarginalResponse {
  start: string;
  end: string;
  cutoff: string;
  note: string;
  rows: MarginalRow[];
}
