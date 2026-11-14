// Thin API client: cookies carry the session, every write sends the CSRF header, one silent refresh on 401.
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : detail?.message ?? "Something went wrong");
    this.status = status;
    this.detail = detail;
  }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "reschedule" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 500));
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; retry?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "reschedule" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), credentials: "include", headers, body });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && opts.retry !== false && !path.startsWith("/auth/")) {
    if (await tryRefresh()) return api<T>(path, { ...opts, retry: false });
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let detail = data?.detail ?? data ?? res.statusText;
    if (Array.isArray(detail)) detail = detail.map((d: any) => String(d.msg ?? d).replace(/^Value error, /, "")).join(". ");
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const downloadUrl = (path: string) => `${API_BASE}${path}`;

// ---- types
export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "owner" | "manager" | "planner" | "operator";
  perms: string[];
  is_admin: boolean;
  demo?: boolean;
  email_verified: boolean;
  shop: { id: string; name: string; timezone: string };
}
export interface PlacedOp {
  op_id: string;
  job: string;
  seq: number;
  machine: string;
  start: number;
  end: number;
  state: "done" | "running" | "frozen" | "planned";
  moved: boolean;
  added: boolean;
  old_machine: string | null;
  old_start: number | null;
}
export interface Win {
  machine?: string;
  job?: string;
  start: number;
  end: number;
  kind: "down" | "absent" | "material";
  label: string;
}
export interface Metrics {
  on_time_pct: number | null;
  jobs_total: number;
  on_time_jobs: number;
  late_jobs: number;
  open_ops: number;
  moved_ops: number;
  added_ops: number;
  moved_pct: number;
  makespan: number;
  recovery_min: number | null;
  solver_status: string;
  gap: number | null;
  solve_s: number;
  machines_touched: string[];
  right_shift?: { on_time_pct: number | null; moved_ops: number; moved_pct: number };
  tradeoffs: { job: string; extra_late_min: number; priority: number }[];
}
export interface Move {
  op_id: string;
  job: string;
  seq: number;
  kind: "moved" | "added";
  from_machine: string | null;
  to_machine: string;
  from_start: number | null;
  to_start: number;
  delta_min: number;
}
export interface Schedule {
  id: string;
  version: number;
  kind: "baseline" | "repair";
  status: "draft" | "published" | "rejected" | "superseded";
  parent_id: string | null;
  origin: string;
  now_min: number;
  metrics: Metrics;
  params: any;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
  ops: PlacedOp[];
  jobs: { code: string; due: number | null; end: number; late_min: number; prev_late_min: number | null; priority: number }[];
  windows: Win[];
  moves: Move[];
  parent?: Schedule | null;
  event?: { type: string; payload: any; raw_text: string } | null;
}
