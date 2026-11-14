export interface Metrics {
  on_time_pct: number | null;
  moved_pct: number | null;
  changeover_min: number | null;
  energy_cost: number | null;
  replan_s: number | null;
  recovery_min: number | null;
}
export interface Strategy {
  id: string;
  label: string;
  metrics: Metrics;
}
export interface FrontierPoint {
  lambda: number;
  on_time_pct: number;
  energy_cost: number;
  changeover_min: number;
  moved_pct: number;
}
export interface Benchmark {
  status: "placeholder" | "example" | "measured";
  generated_at: string | null;
  engine_version: string | null;
  protocol: {
    instance_sizes: string[];
    traces_per_size: number | null;
    time_budget_s: number | null;
    seed: number | null;
  };
  strategies: Strategy[];
  frontier: FrontierPoint[];
}

export async function loadBenchmark(): Promise<Benchmark | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/benchmark.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Benchmark;
  } catch {
    return null;
  }
}
