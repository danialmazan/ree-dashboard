import type { DashboardData, Manifest } from "./types";

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function loadDashboard() {
  const manifest = await readJson<Manifest>("manifest.json");
  const dashboard = await readJson<DashboardData>(manifest.dashboard.path);
  if (manifest.schema_version !== 1 || dashboard.schema_version !== 1) throw new Error("Unsupported data schema");
  return { manifest, dashboard };
}
