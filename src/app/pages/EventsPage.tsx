import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Schedule } from "../api";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { go } from "../router";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Page, Title, ease, inputCls } from "../ui";

type EvType = "breakdown" | "absence" | "power_cut" | "material" | "overrun" | "deadline" | "hold" | "rush" | "gap" | "reorder" | "move_machine";
interface Parsed { options?: { label: string; event: Record<string, any> }[]; event: Record<string, any>; missing: string[]; summary: string; confident: boolean; source?: "rules" | "gemini" }
interface Data { jobs: { code: string }[]; machines: string[] }
interface Cur { published: Schedule | null }

const examplesFor = (m: string[], j: string[]) => [
  `${m[0] ?? "M1"} broke down for 3 hours`,
  "Power cut for 90 minutes",
  `Rush job R-77 needs 2 hours on ${m[1] ?? m[0] ?? "M1"}`,
  `Material for ${j[0] ?? "J-1"} arrives 4 hours late`,
  `Job ${j[1] ?? j[0] ?? "J-1"} is taking 45 minutes longer`,
  `Customer needs ${j[2] ?? j[0] ?? "J-1"} two hours earlier`,
  `Hold job ${j[3] ?? j[0] ?? "J-1"} for 3 hours`,
  `Add a 3 hour gap between ${j[0] ?? "J-1"} and ${j[1] ?? "J-2"} on ${m[0] ?? "M1"}, operator late`,
  `Swap ${j[0] ?? "J-1"} and ${j[1] ?? "J-2"}`,
  `Operator absent on ${m[2] ?? m[0] ?? "M1"} for 90 minutes`,
];
const TYPES: { id: EvType; label: string; plain: string }[] = [
  { id: "breakdown", label: "Machine stops", plain: "One or more machines are down" },
  { id: "absence", label: "Worker absent", plain: "A machine has no operator" },
  { id: "power_cut", label: "Power cut", plain: "Electricity is off (whole shop or some machines)" },
  { id: "material", label: "Material late", plain: "Raw material for a job arrives late" },
  { id: "overrun", label: "Job running slow", plain: "An operation takes longer than planned" },
  { id: "deadline", label: "Due date changed", plain: "A customer moves a deadline" },
  { id: "hold", label: "Hold or cancel a job", plain: "Pause a job for a while, or drop it" },
  { id: "rush", label: "Urgent order", plain: "A new rush job needs a machine today" },
  { id: "gap", label: "Gap between jobs", plain: "Leave idle time after a job (operator late, waiting for tooling…)" },
  { id: "reorder", label: "Swap / move job up or down", plain: "Run one job before or after another" },
  { id: "move_machine", label: "Move job to a machine", plain: "Run a job on a different machine" },
];
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);

function Minutes({ label, value, min, max, step, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={`${label}: ${hm(value || min)}`} hint={hint}>
      <div className="flex items-center gap-3">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={Math.min(max, Math.max(min, value || min))} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[#C8643B]" />
        <Input type="number" aria-label={`${label} in minutes`} min={1} max={10080} value={value || ""} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value))))} className="!w-24" />
        <span className="text-xs text-soft">min</span>
      </div>
    </Field>
  );
}

function MachineChips({ machines, value, onChange, any }: { machines: string[]; value: string[]; onChange: (v: string[]) => void; any?: string }) {
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Machines">
      {machines.map((m) => (
        <button key={m} type="button" aria-pressed={value.includes(m)} onClick={() => toggle(m)}
          className={`rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors ${value.includes(m) ? "border-terra bg-terra text-ivory" : "border-ink/20 hover:bg-ink/5"}`}>{m}</button>
      ))}
      {any && value.length === 0 && <span className="self-center text-xs text-soft">{any}</span>}
    </div>
  );
}

export function EventsPage() {
  const { can } = useAuth();
  const cur = useApi<Cur>("/schedules/current");
  const data = useApi<Data>("/data/jobs");
  const [text, setText] = useState("");
  const [ev, setEv] = useState<Record<string, any>>({});
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState<"rules" | "gemini" | "">("");
  const [note, setNote] = useState("");
  const [stability, setStability] = useState(0.5);
  const [freeze, setFreeze] = useState(60);
  const [atMin, setAtMin] = useState<string>("");
  const [busy, setBusy] = useState<"" | "parse" | "solve">("");
  const [options, setOptions] = useState<{ label: string; event: Record<string, any> }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  if (cur.loading || data.loading) return <Loading />;
  if (!can("plan")) return <Alert tone="amber">Your role can view plans but not report disruptions.</Alert>;
  if (!cur.data?.published) {
    return (
      <Page>
        <Title eyebrow="Step 2" title="Something went wrong on the floor?" />
        <Empty title="Approve a plan first">Disruptions are repaired against your approved plan. Build and approve a first plan, then come back here.
          <div className="mt-6"><Button onClick={() => go("/app")}>Go to plan</Button></div></Empty>
      </Page>
    );
  }
  const machines = data.data?.machines ?? [];
  const jobs = data.data?.jobs.map((j) => j.code) ?? [];
  const type = (ev.type as EvType | undefined) ?? "breakdown";
  const set = (k: string, v: any) => setEv((e) => ({ ...e, type, [k]: v }));
  const mlist: string[] = ev.machines ?? (ev.machine ? [ev.machine] : []);

  function start(t: EvType, from: Record<string, any> = {}): Record<string, any> {
    const ms: string[] = from.machines ?? (from.machine ? [from.machine] : []);
    const d = from.duration_min ?? from.delay_min ?? from.extra_min;
    const j = from.job_id && jobs.includes(from.job_id) ? from.job_id : jobs[0];
    switch (t) {
      case "breakdown": case "absence": return { type: t, machines: ms.length ? ms : machines.slice(0, 1), duration_min: d ?? 60, start_in_min: 0 };
      case "power_cut": return { type: t, machines: ms, duration_min: d ?? 90, start_in_min: 0 };
      case "material": return { type: t, job_id: j, delay_min: d ?? 120 };
      case "overrun": return { type: t, job_id: j, extra_min: d ?? 45 };
      case "deadline": return { type: t, job_id: j, shift_min: from.shift_min ?? -120 };
      case "hold": return { type: t, job_id: j, duration_min: d ?? 180, cancel: !!from.cancel };
      case "gap": return { type: t, job_id: j, second_job_id: from.second_job_id ?? null, machine: from.machine ?? null, duration_min: d ?? 180, reason: from.reason ?? "" };
      case "reorder": return { type: t, job_id: j, other_job_id: from.other_job_id ?? jobs.find((x) => x !== j) ?? null, direction: from.direction ?? "before", machine: null };
      case "move_machine": return { type: t, job_id: j, machine: from.avoid_machine ? null : from.machine ?? machines[0], avoid_machine: from.avoid_machine ?? null, from_machine: from.from_machine ?? null };
      default: return { type: t, job_id: from.job_id && !jobs.includes(from.job_id) ? from.job_id : "RUSH-1", machine: ms[0] ?? null, duration_min: d ?? 120, due_in_min: from.due_in_min ?? null, priority: 1 };
    }
  }
  const shown: Record<string, any> = Object.keys(ev).length ? ev : start("breakdown");

  async function parse(t = text) {
    if (t.trim().length < 3) return;
    setBusy("parse");
    setErr(null);
    setOptions([]);
    try {
      const r = await api<Parsed>("/events/parse", { method: "POST", body: { text: t } });
      if (r.event.type) {
        setEv(start(r.event.type as EvType, r.event));
        setSummary(r.summary);
        setSource(r.confident ? (r.source ?? "rules") : "");
        if (!r.confident) setErr(`${r.summary} Fill in the rest below.`);
      } else {
        setSummary("");
        setOptions(r.options ?? []);
        setErr(r.options?.length ? "I am not sure what you mean. Did you mean one of these? (or pick a situation below)" : "I could not tell what happened. Pick a situation below and set the details by hand.");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function pickType(t: EvType) {
    setEv(start(t, ev));
    setSummary("");
    setSource("");
  }

  async function submit() {
    setBusy("solve");
    setErr(null);
    try {
      const event: Record<string, any> = { ...shown, type };
      if ((event.type === "breakdown" || event.type === "absence") && !(event.machines?.length)) throw new Error("Pick at least one machine.");
      if (event.type === "breakdown" || event.type === "absence") event.machine = event.machines[0];
      const body: any = { event, raw_text: [text || summary, note].filter(Boolean).join(" · ").slice(0, 500), stability, freeze_min: freeze, time_limit: 3 };
      if (atMin !== "") body.at_min = Math.max(0, Math.round(Number(atMin) * 60));
      const s = await api<Schedule>("/events", { method: "POST", body });
      go(`/app/review/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  const durKey = type === "material" ? "delay_min" : type === "overrun" ? "extra_min" : "duration_min";
  const earlier = (shown.shift_min ?? -1) < 0;
  const cancel = !!shown.cancel;

  return (
    <Page>
      <Title eyebrow="Step 2" title="Report what broke" />
      <Card>
        <Field label="Say it in your own words" hint="We turn it into a clear event and show it back to you. Nothing changes until you press the button below, and again when you approve the result.">
          <textarea className={`${inputCls} min-h-[84px] resize-y`} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Lathe-2 broke down for 3 hours" maxLength={500}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") parse(); }} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {examplesFor(machines, jobs).map((x) => (
            <button key={x} onClick={() => { setText(x); parse(x); }} className="rounded-full border border-ink/20 px-3.5 py-1.5 text-xs text-soft transition-colors hover:bg-ink/5 hover:text-ink">{x}</button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button busy={busy === "parse"} disabled={text.trim().length < 3} onClick={() => parse()}>Read my note</Button>
          {source === "gemini" && <Badge tone="terra">Read by Gemini, double-check below</Badge>}
        </div>
      </Card>

      {err && <div className="mt-5"><Alert tone={summary ? "amber" : "brick"}>{err}</Alert></div>}
      {options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Did you mean">
          {options.map((o) => (
            <button key={o.label} type="button" className="rounded-full border border-line bg-ivory px-4 py-2 text-sm hover:border-terra"
              onClick={() => { setEv(start(o.event.type as EvType, o.event)); setSummary(o.label); setSource("rules"); setErr(null); setOptions([]); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        <motion.div key="builder" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="mt-6">
          <Card>
            <div className="eyebrow mb-2">Or build it by hand</div>
            <h2 className="h-display text-2xl text-ink">{summary || "What happened, and for how long?"}</h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Kind of disruption">
              {TYPES.map((t) => (
                <button key={t.id} role="radio" aria-checked={type === t.id} onClick={() => pickType(t.id)} title={t.plain}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${type === t.id ? "border-terra bg-terra text-ivory" : "border-ink/15 hover:bg-ink/5"}`}>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className={`block text-xs ${type === t.id ? "text-ivory/80" : "text-soft"}`}>{t.plain}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {(type === "breakdown" || type === "absence" || type === "power_cut") && (
                <div className="sm:col-span-2">
                  <div className="mb-2 text-sm font-medium text-ink">{type === "power_cut" ? "Which machines lose power?" : "Which machine(s)?"}</div>
                  <MachineChips machines={machines} value={mlist} onChange={(v) => setEv({ ...shown, type, machines: v })} any={type === "power_cut" ? "None selected means the whole shop." : undefined} />
                </div>
              )}
              {(type === "material" || type === "overrun" || type === "deadline" || type === "hold") && (
                <Field label={type === "material" ? "Job waiting for material" : "Which job?"}>
                  <select className={inputCls} value={shown.job_id ?? ""} onChange={(e) => set("job_id", e.target.value)}>
                    {jobs.map((j) => <option key={j}>{j}</option>)}
                  </select>
                </Field>
              )}
              {type === "rush" && (
                <>
                  <Field label="Name of the rush job"><Input value={shown.job_id ?? ""} maxLength={40} onChange={(e) => set("job_id", e.target.value)} /></Field>
                  <Field label="Machine" hint="Leave on any and the planner chooses.">
                    <select className={inputCls} value={shown.machine ?? ""} onChange={(e) => set("machine", e.target.value || null)}>
                      <option value="">Any machine</option>
                      {machines.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {type === "gap" && (
                <>
                  <Field label="After job"><select className={inputCls} value={shown.job_id ?? ""} onChange={(e) => set("job_id", e.target.value)}>{jobs.map((j) => <option key={j}>{j}</option>)}</select></Field>
                  <Field label="Before job (the one that waits)"><select className={inputCls} value={shown.second_job_id ?? ""} onChange={(e) => set("second_job_id", e.target.value || null)}><option value="">(none)</option>{jobs.map((j) => <option key={j}>{j}</option>)}</select></Field>
                  <Field label="Machine"><select className={inputCls} value={shown.machine ?? ""} onChange={(e) => set("machine", e.target.value || null)}><option value="">Wherever that job runs</option>{machines.map((m) => <option key={m}>{m}</option>)}</select></Field>
                  <Field label="Reason (shows on the plan)"><Input value={shown.reason ?? ""} maxLength={120} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. operator late for work" /></Field>
                </>
              )}
              {type === "reorder" && (
                <>
                  <Field label="Run job"><select className={inputCls} value={shown.job_id ?? ""} onChange={(e) => set("job_id", e.target.value)}>{jobs.map((j) => <option key={j}>{j}</option>)}</select></Field>
                  <Field label="How">
                    <select className={inputCls} value={shown.direction ?? "before"} onChange={(e) => set("direction", e.target.value)}>
                      <option value="before">before another job</option><option value="after">after another job</option><option value="swap">swap with another job</option>
                      <option value="up">one place earlier</option><option value="down">one place later</option>
                    </select>
                  </Field>
                  {["before", "after", "swap"].includes(shown.direction ?? "before") && (
                    <Field label="The other job"><select className={inputCls} value={shown.other_job_id ?? ""} onChange={(e) => set("other_job_id", e.target.value)}>{jobs.filter((j) => j !== shown.job_id).map((j) => <option key={j}>{j}</option>)}</select></Field>
                  )}
                </>
              )}
              {type === "move_machine" && (
                <>
                  <Field label="Job"><select className={inputCls} value={shown.job_id ?? ""} onChange={(e) => set("job_id", e.target.value)}>{jobs.map((j) => <option key={j}>{j}</option>)}</select></Field>
                  <Field label="What to do">
                    <select className={inputCls} value={shown.avoid_machine ? "off" : "to"} onChange={(e) => setEv(e.target.value === "off" ? { ...shown, type, machine: null, avoid_machine: shown.avoid_machine ?? machines[0] } : { ...shown, type, avoid_machine: null, machine: shown.machine ?? machines[0] })}>
                      <option value="to">Run it on a specific machine</option>
                      <option value="off">Keep it OFF a machine (planner picks another)</option>
                    </select>
                  </Field>
                  {shown.avoid_machine ? (
                    <Field label="Keep it off"><select className={inputCls} value={shown.avoid_machine ?? ""} onChange={(e) => set("avoid_machine", e.target.value)}>{machines.map((m) => <option key={m}>{m}</option>)}</select></Field>
                  ) : (
                    <Field label="New machine"><select className={inputCls} value={shown.machine ?? ""} onChange={(e) => set("machine", e.target.value)}>{machines.map((m) => <option key={m}>{m}</option>)}</select></Field>
                  )}
                </>
              )}
              {type === "deadline" && (
                <>
                  <Field label="Customer wants it">
                    <div className="inline-flex rounded-full border border-line bg-cream/60 p-1 text-sm" role="radiogroup">
                      {[true, false].map((e) => (
                        <button key={String(e)} role="radio" aria-checked={earlier === e} onClick={() => set("shift_min", (e ? -1 : 1) * Math.abs(shown.shift_min ?? 120))}
                          className={`rounded-full px-5 py-1.5 ${earlier === e ? "bg-ink text-ivory" : "text-soft"}`}>{e ? "Earlier" : "Later"}</button>
                      ))}
                    </div>
                  </Field>
                  <Minutes label="By how much" value={Math.abs(shown.shift_min ?? 0)} min={15} max={1440} step={15} onChange={(v) => set("shift_min", (earlier ? -1 : 1) * v)} />
                </>
              )}
              {type === "hold" && (
                <Field label="What should happen?">
                  <div className="inline-flex rounded-full border border-line bg-cream/60 p-1 text-sm" role="radiogroup">
                    {[false, true].map((c) => (
                      <button key={String(c)} role="radio" aria-checked={cancel === c} onClick={() => setEv({ ...shown, type, cancel: c, duration_min: c ? null : shown.duration_min ?? 180 })}
                        className={`rounded-full px-5 py-1.5 ${cancel === c ? "bg-ink text-ivory" : "text-soft"}`}>{c ? "Cancel the job" : "Pause it"}</button>
                    ))}
                  </div>
                </Field>
              )}
              {!["deadline", "reorder", "move_machine"].includes(type) && !(type === "hold" && cancel) && (
                <Minutes
                  label={type === "gap" ? "Gap length" : type === "material" ? "Material arrives late by" : type === "overrun" ? "Takes longer by" : type === "rush" ? "Run time" : type === "hold" ? "Pause for" : "For how long"}
                  value={shown[durKey] ?? 0} min={5} max={type === "overrun" ? 480 : 1440} step={5} onChange={(v) => set(durKey, v)} />
              )}
              {type === "rush" && (
                <Field label="Needed within (hours)" hint="Optional. Blank means as soon as possible.">
                  <Input type="number" min={0.5} step={0.5} value={shown.due_in_min ? Math.round((shown.due_in_min / 60) * 100) / 100 : ""} onChange={(e) => set("due_in_min", e.target.value ? Math.round(Number(e.target.value) * 60) : null)} />
                </Field>
              )}
            </div>

            <details className="mt-6 rounded-2xl border border-line bg-cream/50 px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium">Fine-tune the fix (optional)</summary>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field label={`Floor calmness: ${stability < 0.34 ? "recover fastest, more jobs may move" : stability > 0.66 ? "calmest floor, as few jobs as possible move" : "balanced"}`} hint="Slide right for fewer changes on the floor.">
                  <input type="range" aria-label="Floor calmness" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} className="accent-[#C8643B]" />
                </Field>
                <Field label="Leave jobs that are about to start alone for" hint="Jobs starting inside this window are never touched.">
                  <select className={inputCls} value={freeze} onChange={(e) => setFreeze(Number(e.target.value))}>
                    {[0, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m === 0 ? "nothing, move anything" : `${m} minutes`}</option>)}
                  </select>
                </Field>
                <Field label="It happened after (hours into the plan)" hint="Blank means right now.">
                  <Input type="number" min={0} step={0.5} value={atMin} onChange={(e) => setAtMin(e.target.value)} placeholder="now" />
                </Field>
                <Field label="Note for the record (optional)"><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. told by the shift lead" /></Field>
              </div>
            </details>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button variant="terra" busy={busy === "solve"} onClick={submit}>{busy === "solve" ? "Finding the smallest fix…" : "Find the smallest fix"}</Button>
              <span className="text-xs text-soft">You compare before and after in step 3. Nothing changes on the floor until you approve.</span>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
