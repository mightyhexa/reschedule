import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import type { Schedule } from "../api";
import { ApiError, api, downloadUrl } from "../api";
import { useAuth } from "../auth";
import { go } from "../router";
import { Alert, Badge, Button, Card, Field, Input, Page, Title, ease, inputCls, useToast } from "../ui";

interface Preview {
  summary: { jobs: number; operations: number; machines: number };
  machines: string[];
  errors: { row: number; message: string }[];
  error_count: number;
  warnings: string[];
  preview: { code: string; due: string | null; priority: number; ops: { seq: number; machines: string[]; duration_min: number }[] }[];
  saved: boolean;
  read_as?: Record<string, string>;
  duration_unit?: "minutes" | "hours";
  labels?: Record<string, string>;
}
interface NeedMap {
  needs_mapping: true;
  message: string;
  columns: string[];
  raw_columns: string[];
  guess: Record<string, string>;
  missing: string[];
  labels: Record<string, string>;
  sample: string[][];
}
interface Row { job_id: string; eligible_machines: string; duration_min: string; due_at: string; priority: string }

const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: "job_id", label: "Job, part or order name", hint: "e.g. J-014, Part No, Work order", required: true },
  { key: "eligible_machines", label: "Machine(s) that can do it", hint: "e.g. M1|M2 or Lathe-2", required: true },
  { key: "duration_min", label: "Time per operation", hint: "minutes or hours, see below", required: true },
  { key: "due_at", label: "Due date", hint: "optional" },
  { key: "op_seq", label: "Operation number", hint: "optional, rows are numbered 1, 2, 3 per job if missing" },
  { key: "priority", label: "Priority", hint: "optional, 1 is most urgent" },
  { key: "family", label: "Material or family", hint: "optional" },
];
const blank = (): Row => ({ job_id: "", eligible_machines: "", duration_min: "", due_at: "", priority: "" });
const EXAMPLE: Row[] = [
  { job_id: "J-1", eligible_machines: "M1|M2", duration_min: "90", due_at: "tomorrow 5pm", priority: "1" },
  { job_id: "J-1", eligible_machines: "M3", duration_min: "45", due_at: "", priority: "" },
  { job_id: "J-2", eligible_machines: "M2", duration_min: "60", due_at: "+8h", priority: "2" },
  { job_id: "J-3", eligible_machines: "M1|M3", duration_min: "120", due_at: "tomorrow 10am", priority: "2" },
];

export function UploadPage() {
  const { can } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"file" | "type">("file");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<"" | "check" | "save" | "plan">("");
  const [rep, setRep] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [need, setNeed] = useState<NeedMap | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<"auto" | "minutes" | "hours">("auto");
  const [machinesTyped, setMachinesTyped] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank(), blank(), blank()]);

  if (!can("plan")) return <Alert tone="amber">Your role can view plans but not upload job cards.</Alert>;

  const mappingJson = (m: Record<string, string>, u = unit, mt = machinesTyped) => {
    const out: Record<string, string> = { ...m };
    if (u !== "auto") out.duration_unit = u;
    if (mt.trim()) out.default_machines = mt.trim();
    return Object.keys(out).length ? JSON.stringify(out) : "";
  };

  async function check(f: File, m: Record<string, string> = pick, u = unit, mt = machinesTyped) {
    setFile(f);
    setRep(null);
    setErr(null);
    setBusy("check");
    const form = new FormData();
    form.append("file", f);
    const mj = mappingJson(m, u, mt);
    if (mj) form.append("mapping", mj);
    try {
      const r = await api<Preview>("/data/upload?dry_run=true", { form });
      setRep(r);
      setNeed(null);
    } catch (e) {
      if (e instanceof ApiError && typeof e.detail === "object" && e.detail?.needs_mapping) {
        const d = e.detail as NeedMap;
        setNeed(d);
        setPick((p) => ({ ...d.guess, ...p }));
      } else if (e instanceof ApiError && typeof e.detail === "object" && e.detail?.errors) {
        setRep(e.detail as Preview);
        setNeed(null);
      } else setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const rowBody = () => rows.map((r) => ({
    job_id: r.job_id.trim(), eligible_machines: r.eligible_machines.trim(), due_at: r.due_at.trim() || null,
    duration_min: r.duration_min.trim() ? Number(r.duration_min) : null, priority: r.priority ? Number(r.priority) : null,
  }));

  async function checkRows() {
    setRep(null);
    setErr(null);
    setBusy("check");
    try {
      setRep(await api<Preview>("/data/manual", { method: "POST", body: { rows: rowBody(), dry_run: true } }));
    } catch (e) {
      if (e instanceof ApiError && typeof e.detail === "object" && e.detail?.errors) setRep(e.detail as Preview);
      else setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function save(thenPlan: boolean) {
    setBusy(thenPlan ? "plan" : "save");
    setErr(null);
    try {
      if (tab === "file") {
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        const mj = mappingJson(pick);
        if (mj) form.append("mapping", mj);
        await api(`/data/upload?mode=${mode}`, { form });
      } else {
        await api("/data/manual", { method: "POST", body: { rows: rowBody(), mode } });
      }
      if (thenPlan) {
        const s = await api<Schedule>("/plan/baseline", { method: "POST", body: { time_limit: 5 } });
        toast("Plan built. Review it before it goes live.");
        go(`/app/review/${s.id}`);
      } else {
        toast("Job cards saved");
        setRep((r) => (r ? { ...r, saved: true } : r));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const setRow = (i: number, k: keyof Row, v: string) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setRep(null); };
  const ok = rep && rep.error_count === 0;
  const lineWord = tab === "type" ? "line" : "row";
  const mapReady = need ? need.missing.every((k) => pick[k] || (k === "eligible_machines" && machinesTyped.trim())) : false;

  return (
    <Page>
      <Title eyebrow="Step 1" title="Add your jobs">
        <a href={downloadUrl("/data/template.csv")} className="text-sm text-soft underline underline-offset-4 hover:text-ink">Download the CSV template</a>
      </Title>

      <div className="mb-5 inline-flex rounded-full border border-line bg-cream/60 p-1 text-sm" role="tablist" aria-label="How to add jobs">
        {([["file", "Upload a file"], ["type", "Type jobs in"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setRep(null); setErr(null); }}
            className={`rounded-full px-5 py-2 transition-colors ${tab === k ? "bg-ink text-ivory" : "text-soft hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "file" ? (
        <Card>
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) { setPick({}); setNeed(null); check(f, {}); } }}
            onClick={() => input.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            className={`relative cursor-pointer overflow-hidden rounded-[24px] border-2 border-dashed px-6 py-14 text-center transition-colors duration-300 ${over ? "border-terra bg-terra/5" : "border-ink/20 hover:border-terra/60"}`}
          >
            <motion.div animate={over ? { scale: 1.06, y: -4 } : { scale: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C8643B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" aria-hidden>
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
              </svg>
              <div className="h-display mt-4 text-2xl">{file ? file.name : "Drop a file here, or click to choose"}</div>
              <p className="mx-auto mt-2 max-w-md text-sm text-soft">Excel (.xlsx), CSV, or a Word document with a table. Use the sheet you already have. No sensors, no hardware.</p>
            </motion.div>
            <input ref={input} type="file" hidden accept=".xlsx,.csv,.txt,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPick({}); setNeed(null); setUnit("auto"); check(f, {}, "auto"); } e.target.value = ""; }} />
            {busy === "check" && <motion.div className="absolute inset-x-0 bottom-0 h-1 bg-terra" initial={{ scaleX: 0, originX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.4, ease }} />}
          </div>
          <p className="mt-4 text-xs text-soft">Any column names work: "Part No", "Station", "Est Time (hrs)", "Ship Date". Hours are converted to minutes. Due dates like "tomorrow 5pm", "14 Nov" or "+8h" are fine. If we cannot tell which column is which, we ask you.</p>
        </Card>
      ) : (
        <Card>
          <h2 className="h-display text-2xl">Type 3 or 4 jobs, no file needed</h2>
          <p className="mt-1 text-sm text-soft">One line per step. Give the same job name on two lines for a job with two steps. Machines are separated with | (M1|M2 means either one).</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[12.5px] font-medium text-soft">
                <tr><th className="pb-2 pr-2">Job</th><th className="pb-2 pr-2">Machines</th><th className="pb-2 pr-2">Minutes</th><th className="pb-2 pr-2">Due</th><th className="pb-2 pr-2">Priority</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="pb-2 pr-2"><Input aria-label={`Job on line ${i + 1}`} value={r.job_id} maxLength={60} onChange={(e) => setRow(i, "job_id", e.target.value)} placeholder="J-1" /></td>
                    <td className="pb-2 pr-2"><Input aria-label={`Machines on line ${i + 1}`} value={r.eligible_machines} maxLength={200} onChange={(e) => setRow(i, "eligible_machines", e.target.value)} placeholder="M1|M2" /></td>
                    <td className="pb-2 pr-2"><Input aria-label={`Minutes on line ${i + 1}`} type="number" min={1} max={10080} value={r.duration_min} onChange={(e) => setRow(i, "duration_min", e.target.value)} placeholder="60" className="!w-24" /></td>
                    <td className="pb-2 pr-2"><Input aria-label={`Due on line ${i + 1}`} value={r.due_at} maxLength={60} onChange={(e) => setRow(i, "due_at", e.target.value)} placeholder="tomorrow 5pm" /></td>
                    <td className="pb-2 pr-2">
                      <select aria-label={`Priority on line ${i + 1}`} className={`${inputCls} !w-24`} value={r.priority} onChange={(e) => setRow(i, "priority", e.target.value)}>
                        <option value="">normal</option><option value="1">1 urgent</option><option value="2">2 normal</option><option value="3">3 low</option>
                      </select>
                    </td>
                    <td className="pb-2"><button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => { setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)); setRep(null); }} className="px-2 text-soft hover:text-brick">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="ghost" small disabled={rows.length >= 60} onClick={() => setRows((rs) => [...rs, blank()])}>+ Add a line</Button>
            <Button variant="ghost" small onClick={() => { setRows(EXAMPLE.map((r) => ({ ...r }))); setRep(null); }}>Fill with an example</Button>
            <Button busy={busy === "check"} disabled={busy !== "" || !rows.some((r) => r.job_id.trim())} onClick={checkRows}>Check my jobs</Button>
          </div>
        </Card>
      )}

      {err && <div className="mt-5"><Alert>{err}</Alert></div>}

      <AnimatePresence>
        {tab === "file" && need && (
          <motion.div key="map" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="mt-6">
            <Card>
              <div className="eyebrow mb-2">Map your columns</div>
              <h2 className="h-display text-2xl">Help us read this sheet</h2>
              <p className="mt-1 text-sm text-soft">{need.message} Each dropdown lists the columns found in your file.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
                    <select className={inputCls} value={pick[f.key] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [f.key]: e.target.value }))}>
                      <option value="">{f.required ? "Choose a column…" : "(none)"}</option>
                      {need.raw_columns.filter((c) => c).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                ))}
                <Field label="The time column is in" hint="Leave on auto and we will guess from the header and the numbers.">
                  <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                    <option value="auto">auto</option><option value="minutes">minutes</option><option value="hours">hours</option>
                  </select>
                </Field>
                {!pick.eligible_machines && (
                  <Field label="No machine column? Type the machines" hint="Every job may then run on any of these, e.g. M1|M2|M3">
                    <Input value={machinesTyped} onChange={(e) => setMachinesTyped(e.target.value)} placeholder="M1|M2|M3" maxLength={200} />
                  </Field>
                )}
              </div>
              {need.sample.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="bg-cream/70 font-mono uppercase text-soft"><tr>{need.columns.slice(0, 8).map((c, i) => <th key={i} className="px-3 py-2">{c}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">{need.sample.map((r, i) => <tr key={i}>{r.slice(0, 8).map((c, j) => <td key={j} className="px-3 py-2 text-soft">{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
              <div className="mt-5"><Button variant="terra" disabled={!mapReady || !file || busy !== ""} busy={busy === "check"} onClick={() => file && check(file)}>Use these columns</Button></div>
            </Card>
          </motion.div>
        )}

        {rep && (
          <motion.div key="rep" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease }} className="mt-6 grid gap-6">
            {rep.error_count > 0 ? (
              <Card>
                <h2 className="h-display text-2xl text-brick">{rep.error_count} problem{rep.error_count === 1 ? "" : "s"} to fix</h2>
                <p className="mt-1 text-sm text-soft">Nothing was saved. {tab === "type" ? "Fix these lines and check again." : "Fix these rows in your file and drop it again."}</p>
                <ul className="mt-4 divide-y divide-line text-sm">
                  {rep.errors.map((e, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex gap-4 py-2.5">
                      <span className="w-16 shrink-0 font-mono text-xs text-soft">{e.row ? `${lineWord} ${tab === "type" ? e.row - 1 : e.row}` : "file"}</span>
                      <span>{e.message}</span>
                    </motion.li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="h-display text-2xl">Looks good</h2>
                  <Badge tone="sage">{rep.summary.jobs} jobs</Badge>
                  <Badge tone="sage">{rep.summary.operations} operations</Badge>
                  <Badge tone="sage">{rep.summary.machines} machines</Badge>
                </div>
                {tab === "file" && rep.read_as && Object.keys(rep.read_as).length > 0 && (
                  <div className="mt-4 rounded-2xl border border-line bg-cream/50 px-4 py-3 text-sm">
                    <div className="eyebrow mb-2">How we read your file</div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-soft">
                      {Object.entries(rep.read_as).map(([k, v]) => (
                        <span key={k}>{rep.labels?.[k] ?? k} <span className="text-ink">← {v}</span></span>
                      ))}
                      {rep.duration_unit && <span>Times are in <span className="text-ink">{rep.duration_unit}</span></span>}
                    </div>
                    {file && rep.duration_unit && (
                      <button type="button" onClick={() => { const u = rep.duration_unit === "hours" ? "minutes" : "hours"; setUnit(u); check(file, pick, u); }}
                        className="mt-2 text-xs text-terra underline underline-offset-4">Not right? Read the times as {rep.duration_unit === "hours" ? "minutes" : "hours"} instead</button>
                    )}
                  </div>
                )}
                {rep.warnings.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {rep.warnings.slice(0, 6).map((w, i) => <li key={i}><Alert tone="amber">{w}</Alert></li>)}
                  </ul>
                )}
                <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-cream/70 text-[12.5px] font-medium text-soft">
                      <tr><th className="px-4 py-2.5">Job</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5">Priority</th><th className="px-4 py-2.5">Route</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rep.preview.slice(0, 8).map((j) => (
                        <tr key={j.code}>
                          <td className="px-4 py-2.5 font-mono">{j.code}</td>
                          <td className="px-4 py-2.5 text-soft">{j.due ? j.due.replace("T", " ") : "none"}</td>
                          <td className="px-4 py-2.5">{j.priority}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-soft">{j.ops.map((o) => `${o.machines.join("|")} ${o.duration_min}m`).join(" → ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rep.summary.jobs > 8 && <p className="mt-2 text-xs text-soft">Showing 8 of {rep.summary.jobs} jobs.</p>}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-full border border-line bg-cream/60 p-1 text-sm" role="radiogroup" aria-label="Save mode">
                    {(["replace", "append"] as const).map((m) => (
                      <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                        className={`rounded-full px-4 py-1.5 transition-colors ${mode === m ? "bg-ink text-ivory" : "text-soft hover:text-ink"}`}>
                        {m === "replace" ? "Replace my job cards" : "Add to existing"}
                      </button>
                    ))}
                  </div>
                  <Button variant="terra" busy={busy === "plan"} disabled={!ok || busy !== ""} onClick={() => save(true)}>{busy === "plan" ? "Building your plan…" : "Save and build the plan"}</Button>
                  <Button variant="ghost" busy={busy === "save"} disabled={!ok || busy !== ""} onClick={() => save(false)}>Save only</Button>
                </div>
                {mode === "replace" && <p className="mt-3 text-xs text-soft">Replacing removes the current job cards. Plans you already approved stay in History.</p>}
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
