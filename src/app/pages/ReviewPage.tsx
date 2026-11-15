import { duckSignal } from "../../assistant/events";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Schedule } from "../api";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { go } from "../router";
import { clock, dur } from "../time";
import { Legend, PlanGantt } from "../PlanGantt";
import { Alert, Badge, Button, Card, Field, Input, Loading, Page, Stat, Title, ease, useToast } from "../ui";

const evName: Record<string, string> = {
  breakdown: "Machine stops", absence: "Worker absent", power_cut: "Power cut", material: "Material late",
  overrun: "Job running slow", deadline: "Due date changed", hold: "Job on hold", rush: "Urgent order", gap: "Gap added", reorder: "Jobs reordered", move_machine: "Job moved",
};
/** The solver's status word, said the way a planner would say it. */
const fixQuality = (s: string) => ({ OPTIMAL: "best possible fix", FEASIBLE: "good fix, found in the time allowed", FALLBACK_RIGHT_SHIFT: "simple fallback: everything pushed later" }[s] ?? "fix found");

export function ReviewPage({ id }: { id: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: s, loading, error, reload } = useApi<Schedule>(`/schedules/${id}`);
  const [mode, setMode] = useState<"before" | "after">("before");
  const [note, setNote] = useState("");
  const [stab, setStab] = useState(0.5);
  const [busy, setBusy] = useState<"" | "approve" | "reject" | "again">("");
  const [err, setErr] = useState<string | null>(null);
  const [again, setAgain] = useState(false);

  // show the old plan first, then slide the bars into the proposal
  useEffect(() => {
    setMode("before");
    const t = setTimeout(() => setMode("after"), 900);
    return () => clearTimeout(t);
  }, [id, s?.id]);

  if (loading && !s) return <Loading />;
  if (error || !s) return <Alert>{error ?? "Plan not found"}</Alert>;
  const m = s.metrics;
  const isRepair = s.kind === "repair";
  const draft = s.status === "draft";
  const canDecide = can("approve") && draft;
  const prevOnTime = s.parent?.metrics.on_time_pct ?? null;
  const rs = m.right_shift;

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setErr(null);
    try {
      await api(`/schedules/${id}/${kind}`, { method: "POST", body: { note } });
      toast(kind === "approve" ? "Approved. The new plan is live." : "Rejected. The current plan stays.");
      if (kind === "approve") duckSignal("approved");
      go("/app");
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }
  async function regenerate() {
    setBusy("again");
    setErr(null);
    try {
      const n = await api<Schedule>(`/schedules/${id}/regenerate`, { method: "POST", body: { stability: stab, freeze_min: s?.params?.freeze_min ?? 60, time_limit: 3 } });
      toast("Another plan is ready");
      setAgain(false);
      go(`/app/review/${n.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const tone = { draft: "amber", published: "sage", rejected: "brick", superseded: "soft" }[s.status] as "amber" | "sage" | "brick" | "soft";

  return (
    <Page>
      <Title eyebrow={`Version ${s.version} · ${isRepair ? (s.event ? evName[s.event.type] ?? "Disruption" : "Disruption") : "Baseline"}`} title={isRepair ? "Here is the fix. Check it, then approve." : "Here is your first plan. Check it, then approve."}>
        <Badge tone={tone}>{s.status === "draft" ? "waiting for approval" : s.status}</Badge>
      </Title>

      {isRepair && (
        <p className="mb-6 rounded-2xl border border-sage/40 bg-sage/10 px-5 py-3 text-[17px] font-medium text-[#44563A]">
          {m.late_jobs === 0 ? "Every job still finishes on time." : `${m.on_time_jobs} of ${m.jobs_total} jobs finish on time.`} Only {m.moved_ops} job step{m.moved_ops === 1 ? " moves" : "s move"}{rs ? `, instead of ${rs.moved_ops} if everything were pushed later` : ""}.
        </p>
      )}
      {s.event?.raw_text && <p className="-mt-4 mb-6 max-w-2xl text-soft">“{s.event.raw_text}”</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Finish on time" value={m.on_time_pct} suffix="%" decimals={1} tone="sage" sub={prevOnTime != null ? `was ${prevOnTime.toFixed(1)}%` : `${m.on_time_jobs} of ${m.jobs_total} jobs`} />
        {isRepair ? (
          <Stat label="Steps that move" value={m.moved_ops} sub={`${m.moved_pct.toFixed(1)}% of the plan${m.added_ops ? ` · ${m.added_ops} added` : ""}`} tone="terra" />
        ) : (
          <Stat label="Job steps" value={s.ops.length} sub={`${m.jobs_total} jobs`} />
        )}
        <Stat label="Late jobs" value={m.late_jobs} tone={m.late_jobs ? "brick" : "sage"} />
        <Stat label="Worked out in" value={m.solve_s} suffix=" s" decimals={2} sub={fixQuality(m.solver_status)} />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="h-display text-2xl">{isRepair ? "Before and after" : "Machines and time"}</h2>
          {isRepair && (
            <div className="inline-flex rounded-full border border-line bg-cream/60 p-1 text-sm" role="radiogroup" aria-label="Plan version">
              {(["before", "after"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className="relative rounded-full px-5 py-1.5">
                  {mode === k && <motion.span layoutId="seg" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                  <span className={`relative z-10 ${mode === k ? "text-ivory" : "text-soft"}`}>{k === "before" ? "Today" : "With the fix"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <PlanGantt ops={s.ops} windows={s.windows} origin={s.origin} nowMin={s.now_min} mode={isRepair ? mode : "after"} />
        <Legend moved={isRepair} />
      </Card>

      {isRepair && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h2 className="h-display text-2xl">What moves</h2>
            {s.moves.length === 0 ? <p className="mt-3 text-soft">Nothing needs to move.</p> : (
              <ul className="mt-4 divide-y divide-line">
                {s.moves.map((mv, i) => (
                  <motion.li key={mv.op_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.4, ease }} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span><span className="font-mono">{mv.job}</span> <span className="text-soft">step {mv.seq}</span></span>
                    <span className="font-mono text-xs text-soft">
                      {mv.kind === "added" ? <Badge tone="terra">new</Badge> : <>{mv.from_machine} {mv.from_start != null ? clock(s.origin, mv.from_start) : ""} → </>}
                      <span className="text-ink">{mv.to_machine} {clock(s.origin, mv.to_start)}</span>
                      {mv.kind !== "added" && <span className="ml-2 text-terra">{mv.delta_min > 0 ? "+" : ""}{dur(mv.delta_min)}</span>}
                    </span>
                  </motion.li>
                ))}
              </ul>
            )}
          </Card>
          <div className="grid content-start gap-6">
            {rs && (
              <Card tone="cream">
                <div className="eyebrow mb-3">If you just pushed every job later</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-soft">With this fix</div><div className="h-display text-3xl">{m.on_time_pct?.toFixed(1)}%</div><div className="text-xs text-soft">on time, {m.moved_ops} moved</div></div>
                  <div><div className="text-soft">Push everything later</div><div className="h-display text-3xl text-soft">{rs.on_time_pct?.toFixed(1)}%</div><div className="text-xs text-soft">on time, {rs.moved_ops} moved</div></div>
                </div>
              </Card>
            )}
            <Card>
              <h2 className="h-display text-2xl">What it costs</h2>
              {m.tradeoffs.length === 0 ? <p className="mt-3 text-soft">No job gets later.</p> : (
                <ul className="mt-4 divide-y divide-line text-sm">
                  {m.tradeoffs.slice(0, 6).map((t) => (
                    <li key={t.job} className="flex justify-between py-2.5"><span className="font-mono">{t.job}</span><Badge tone={t.extra_late_min > 0 ? "brick" : "sage"}>{t.extra_late_min > 0 ? `+${dur(t.extra_late_min)} late` : `${dur(-t.extra_late_min)} earlier`}</Badge></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {err && <div className="mt-6"><Alert>{err}</Alert></div>}

      {draft && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5, ease }} className="sticky bottom-4 z-20 mt-8">
          <Card tone="dark" className="!p-5">
            {canDecide ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-auto min-w-[200px] flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Add a note (optional)" className="!bg-white/5 !text-ivory !border-white/15" /></div>
                  <Button variant="terra" busy={busy === "approve"} disabled={busy !== ""} onClick={() => decide("approve")}>Approve</Button>
                  <Button variant="ghost" className="!border-white/25 !text-ivory hover:!bg-white/10" busy={busy === "reject"} disabled={busy !== ""} onClick={() => decide("reject")}>Reject</Button>
                  {isRepair && <Button variant="ghost" className="!border-white/25 !text-ivory hover:!bg-white/10" disabled={busy !== ""} onClick={() => setAgain((a) => !a)}>Try another fix</Button>}
                </div>
                <AnimatePresence>
                  {again && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <Field label={`How much to change: ${stab < 0.34 ? "fix it fastest" : stab > 0.66 ? "touch as little as possible" : "a balance of both"}`}>
                        <input type="range" min={0} max={1} step={0.05} value={stab} onChange={(e) => setStab(Number(e.target.value))} className="accent-[#E0A33A]" />
                      </Field>
                      <div className="mt-3"><Button variant="terra" small busy={busy === "again"} onClick={regenerate}>Find another fix</Button></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-sm text-[#D9CDBE]">A manager or the owner needs to approve this. Nothing changes on the floor until they do.</p>
            )}
          </Card>
        </motion.div>
      )}
      {!draft && s.decision_note && <p className="mt-6 text-sm text-soft">Note: {s.decision_note}</p>}
      {!draft && <div className="mt-6"><Button variant="ghost" small onClick={() => { reload(); go("/app/history"); }}>Back to history</Button></div>}
    </Page>
  );
}
