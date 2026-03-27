import type {
  BalanceRow,
  CapacityRow,
  CoverageResponse,
  EmissionsRow,
  ExchangeRow,
  GenerationRow,
  MarginalResponse,
  MetadataResponse,
  PeriodMode,
  TechnologyView
} from "./types";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  return response.json() as Promise<T>;
}

export function fetchMetadata() {
  return getJson<MetadataResponse>("/api/metadata");
}

export function fetchGeneration(grain: PeriodMode, technologyView: TechnologyView) {
  return getJson<{ rows: GenerationRow[] }>(`/api/generation?grain=${grain}&technology_view=${technologyView}`);
}

export function fetchGenerationDetail(technologyView: TechnologyView, keys: string[]) {
  const query = keys.map((key) => `technology_keys=${encodeURIComponent(key)}`).join("&");
  return getJson<{ monthly: GenerationRow[]; annual: GenerationRow[] }>(
    `/api/generation/detail?technology_view=${technologyView}&${query}`
  );
}

export function fetchExchanges(grain: PeriodMode, direction: "net" | "imports" | "exports") {
  return getJson<{ rows: ExchangeRow[] }>(`/api/exchanges?grain=${grain}&direction=${direction}`);
}

export function fetchBalance(grain: PeriodMode) {
  return getJson<{ rows: BalanceRow[] }>(`/api/balance?grain=${grain}`);
}

export function fetchCapacity() {
  return getJson<{ rows: CapacityRow[] }>("/api/capacity?grain=year");
}

export function fetchEmissions(grain: PeriodMode) {
  return getJson<{ rows: EmissionsRow[] }>(`/api/emissions?grain=${grain}`);
}

export function fetchCoverageStats(sourceSet: string[], threshold: number, start: string, end: string) {
  const query = sourceSet.map((key) => `source_set=${encodeURIComponent(key)}`).join("&");
  return getJson<CoverageResponse>(
    `/api/coverage-stats?threshold=${threshold}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&${query}`
  );
}

export function fetchMarginalTechnology(start: string, end: string) {
  return getJson<MarginalResponse>(
    `/api/marginal-technology?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
}
