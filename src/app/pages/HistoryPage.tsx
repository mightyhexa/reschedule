import { motion } from "framer-motion";
import type { Schedule } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { go } from "../router";
import { ago } from "../time";
import { Alert, Badge, Card, Empty, Loading, Page, Title, ease } from "../ui";

interface Audit { entries: { id: string; action: string; user: string | null; detail: Record<string, any>; created_at: string }[] }

const tone = { draft: "amber", published: "sage", rejected: "brick", superseded: "soft" } as const;
const nice: Record<string, string> = {
  "plan.approved": "Approved a plan", "plan.rejected": "Rejected a plan", "plan.regenerated": "Asked for another plan", "plan.baseline_created": "Built a baseline plan",
  "event.reported": "Reported a disruption", "data.uploaded": "Uploaded job cards", "team.invited": "Added a team member", "team.updated": "Changed a team member",
  "auth.login": "Signed in", "auth.logout_all": "Signed out everywhere", "shop.updated": "Updated shop settings",
};

export function HistoryPage() {
  const { can } = useAuth();
  const list = useApi<{ schedules: Schedule[] }>("/schedules");
  const audit = useApi<Audit>(can("approve") ? "/audit?limit=40" : null);
  if (list.loading) return <Loading />;
  if (list.error) return <Alert>{list.error}</Alert>;
  const rows = list.data?.schedules ?? [];
  return (
    <Page>
      <Title eyebrow="History" title="Every plan, and who approved it" />
      {rows.length === 0 ? <Empty title="Nothing yet">Plans and disruptions will appear here.</Empty> : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((s, i) => (
              <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.4, ease }}>
                <button onClick={() => go(`/app/review/${s.id}`)} className="flex w-full flex-wrap items-center justify-between gap-3 py-4 text-left transition-colors hover:text-terra">
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-sm text-soft">v{s.version}</span>
                    <span className="text-[15px] font-medium">{s.kind === "baseline" ? "Baseline plan" : "Disruption repair"}</span>
                    <Badge tone={tone[s.status]}>{s.status === "draft" ? "waiting" : s.status}</Badge>
                  </span>
                  <span className="text-sm text-soft">{s.metrics.on_time_pct != null ? `${s.metrics.on_time_pct.toFixed(1)}% on time` : ""}{s.kind === "repair" ? ` · ${s.metrics.moved_ops} moved` : ""} · {ago(s.created_at)}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </Card>
      )}
      {can("approve") && audit.data && (
        <Card className="mt-6">
          <h2 className="h-display text-2xl">Activity log</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {audit.data.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="font-medium">{e.user ?? "System"}</span> <span className="text-soft">{nice[e.action] ?? e.action}</span></span>
                <span className="font-mono text-xs text-soft">{ago(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
