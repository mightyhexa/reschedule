import { useState } from "react";
import { PlanGantt, Legend } from "../PlanGantt";
import type { PlacedOp, Schedule } from "../api";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { go } from "../router";
import { clock, dur } from "../time";
import { Alert, Badge, Button, Card, Empty, Loading, Page, Stat, Title, inputCls, useToast } from "../ui";

interface Current { published: Schedule | null; drafts: Schedule[] }
interface Shop { name: string; jobs: number; machines: number; pending: number }

export function PlanPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const cur = useApi<Current>("/schedules/current");
  const shop = useApi<Shop>("/shop");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (cur.loading || shop.loading) return <Loading />;
  if (cur.error) return <Alert>{cur.error}</Alert>;
  const p = cur.data?.published ?? null;
  const drafts = cur.data?.drafts ?? [];
  const jobs = shop.data?.jobs ?? 0;

  async function build() {
    setBusy(true);
    setErr(null);
    try {
      const s = await api<Schedule>("/plan/baseline", { method: "POST", body: { time_limit: 5 } });
      toast("Baseline plan ready for approval");
      go(`/app/review/${s.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return (
      <Page>
        <Title eyebrow={user?.shop.name} title="Your plan" />
        {err && <div className="mb-4"><Alert>{err}</Alert></div>}
        {drafts.length > 0 ? (
          <Card>
            <h2 className="h-display text-2xl">A plan is waiting for approval</h2>
            <p className="mt-2 max-w-xl text-soft">Nothing is applied to your shop until a manager approves it.</p>
            <div className="mt-6"><Button onClick={() => go(`/app/review/${drafts[0].id}`)}>Review the plan</Button></div>
          </Card>
        ) : jobs === 0 ? (
          <Empty title="No job cards yet">
            Drop an Excel, CSV or Word planning file and ReSchedule builds the first plan from it.
            {can("plan") && <div className="mt-6"><Button onClick={() => go("/app/upload")}>Upload job cards</Button></div>}
          </Empty>
        ) : (
          <Card>
            <h2 className="h-display text-2xl">{jobs} jobs loaded across {shop.data?.machines} machines</h2>
            <p className="mt-2 max-w-xl text-soft">Build the first plan. You review it before anything goes out.</p>
            {can("plan") && <div className="mt-6"><Button variant="terra" busy={busy} onClick={build}>{busy ? "Solving…" : "Build baseline plan"}</Button></div>}
          </Card>
        )}
      </Page>
    );
  }

  const m = p.metrics;
  const late = p.jobs.filter((j) => j.late_min > 0);
  return (
    <Page>
      <Title eyebrow={`Version ${p.version} · ${p.kind === "repair" ? "after a disruption" : "baseline"}`} title="Your plan">
        {drafts.length > 0 && <Button variant="ghost" small onClick={() => go(`/app/review/${drafts[0].id}`)}>{drafts.length} awaiting approval</Button>}
        {can("plan") && <Button variant="terra" small onClick={() => go("/app/events")}>Report a disruption</Button>}
      </Title>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="On time" value={m.on_time_pct} suffix="%" decimals={1} sub={`${m.on_time_jobs} of ${m.jobs_total} jobs`} tone="sage" />
        <Stat label="Late jobs" value={m.late_jobs} sub={late.length ? "see list below" : "none"} tone={m.late_jobs ? "brick" : undefined} />
        <Stat label="Steps still to do" value={m.open_ops} sub={`${shop.data?.machines ?? 0} machines`} />
        <Stat label="Work still ahead" value={Math.round((m.makespan / 60) * 10) / 10} suffix=" h" decimals={1} sub={`ends ${clock(p.origin, m.makespan, true)}`} />
      </div>
      {can("plan") && <QuickAdjust ops={p.ops} />}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="h-display text-2xl">Machines and time</h2>
          <Badge tone="soft">ends {clock(p.origin, m.makespan, true)} · {dur(m.makespan)} of work</Badge>
        </div>
        <PlanGantt ops={p.ops} windows={p.windows} origin={p.origin} nowMin={p.now_min} mode="after" />
        <Legend moved={false} />
      </Card>
      {late.length > 0 && (
        <Card className="mt-6">
          <h2 className="h-display text-2xl">Jobs that miss their due time</h2>
          <ul className="mt-4 divide-y divide-line">
            {late.map((j) => (
              <li key={j.code} className="flex items-center justify-between py-3 text-sm">
                <span className="font-mono">{j.code}</span>
                <Badge tone="brick">{dur(j.late_min)} late</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}


function QuickAdjust({ ops }: { ops: PlacedOp[] }) {
  const live = ops.filter((o) => o.state !== "done");
  const jobs = [...new Set(live.map((o) => o.job))];
  const machines = [...new Set(ops.map((o) => o.machine))];
  const [job, setJob] = useState(jobs[0] ?? "");
  const [act, setAct] = useState<"up" | "down" | "machine" | "off" | "gap">("up");
  const [mc, setMc] = useState(machines[0] ?? "");
  const [hrs, setHrs] = useState(1);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = live.find((o) => o.job === job);

  async function run() {
    setBusy(true);
    setErr(null);
    const event =
      act === "up" || act === "down" ? { type: "reorder", job_id: job, direction: act }
      : act === "machine" ? { type: "move_machine", job_id: job, machine: mc }
      : act === "off" ? { type: "move_machine", job_id: job, avoid_machine: cur?.machine }
      : { type: "gap", job_id: job, machine: cur?.machine ?? null, duration_min: Math.max(1, Math.round(hrs * 60)), reason: why || "Manual gap" };
    try {
      const s = await api<Schedule>("/events", { method: "POST", body: { event, raw_text: `Quick adjust: ${act} ${job}`, stability: 0.5, freeze_min: 0, time_limit: 3 } });
      go(`/app/review/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  if (jobs.length === 0) return null;
  return (
    <Card className="mb-6 !p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="eyebrow w-full">Quick adjust: change the order, add a gap or move a job, then approve</div>
        <label className="grid gap-1"><span className="text-xs text-soft">Job</span>
          <select className={inputCls} value={job} onChange={(e) => setJob(e.target.value)}>{jobs.map((j) => <option key={j}>{j}</option>)}</select></label>
        <div className="inline-flex flex-wrap rounded-full border border-line bg-cream/60 p-1" role="radiogroup" aria-label="Adjustment">
          {([["up", "Run earlier"], ["down", "Run later"], ["machine", "Other machine"], ["off", "Take off its machine"], ["gap", "Add gap after"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={act === k} onClick={() => setAct(k)} className={`rounded-full px-3.5 py-1.5 ${act === k ? "bg-ink text-ivory" : "text-soft"}`}>{l}</button>
          ))}
        </div>
        {act === "machine" && <select aria-label="New machine" className={inputCls + " !w-28"} value={mc} onChange={(e) => setMc(e.target.value)}>{machines.map((m) => <option key={m}>{m}</option>)}</select>}
        {act === "gap" && (
          <>
            <label className="flex items-center gap-2"><input type="number" min={0.25} step={0.25} value={hrs} onChange={(e) => setHrs(Number(e.target.value))} className={inputCls + " !w-20"} aria-label="Gap hours" /><span className="text-xs text-soft">hours</span></label>
            <input aria-label="Reason" value={why} maxLength={120} onChange={(e) => setWhy(e.target.value)} placeholder="Reason (optional)" className={inputCls + " !w-48"} />
          </>
        )}
        <Button variant="terra" small busy={busy} onClick={run}>Re-plan &amp; preview</Button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-brick">{err}</p>}
    </Card>
  );
}
