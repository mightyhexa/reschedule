import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import type { PlacedOp, Win } from "./api";
import { clock, dayLabel, dur } from "./time";

const ROW = 46;
const LABEL_W = 64;

/** Machine-by-time chart. In "before" mode bars sit where the old plan had them; switching to "after" slides them. */
export function PlanGantt({ ops, windows = [], origin, nowMin = 0, mode = "after", machines }: {
  ops: PlacedOp[];
  windows?: Win[];
  origin: string;
  nowMin?: number;
  mode?: "before" | "after";
  machines?: string[];
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const rows = useMemo(() => {
    const set = new Set<string>(machines ?? []);
    ops.forEach((o) => {
      set.add(o.machine);
      if (o.old_machine) set.add(o.old_machine);
    });
    windows.forEach((w) => w.machine && set.add(w.machine));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [ops, windows, machines]);
  const rowOf = (m: string) => rows.indexOf(m);

  const horizon = useMemo(() => {
    const e = Math.max(60, ...ops.map((o) => o.end), ...ops.map((o) => o.old_start != null ? o.old_start + (o.end - o.start) : 0), ...windows.map((w) => w.end));
    return Math.ceil(e / 60) * 60;
  }, [ops, windows]);
  const ppm = Math.max(0.75, Math.min(2.2, 980 / horizon));
  const width = horizon * ppm;
  const step = ppm >= 1.4 ? 60 : ppm >= 0.9 ? 120 : 240;
  const ticks = Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step);

  const place = (o: PlacedOp) => {
    const before = mode === "before" && o.old_start != null && !o.added;
    const start = before ? o.old_start! : o.start;
    const machine = before ? o.old_machine ?? o.machine : o.machine;
    const d = o.end - o.start;
    return { left: start * ppm, top: rowOf(machine) * ROW + 6, width: Math.max(4, d * ppm - 2), hidden: mode === "before" && o.added };
  };

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 150, damping: 22, mass: 0.9 };
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-cream/40 pb-2" role="img" aria-label="Production plan by machine">
      <div className="relative" style={{ width: width + LABEL_W + 24, minHeight: rows.length * ROW + 44 }}>
        {/* time axis */}
        <div className="relative h-9 border-b border-line" style={{ marginLeft: LABEL_W }}>
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full" style={{ left: t * ppm }}>
              <div className="h-2 w-px bg-ink/25" />
              <div className="mt-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-soft">
                {clock(origin, t)}
                {(t === 0 || ((new Date(origin).getHours() * 60 + new Date(origin).getMinutes() + t) % 1440) < step) && <span className="ml-1 text-terra">{dayLabel(origin, t).replace(",", "").split(" ").slice(0, 2).join(" ")}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="relative" style={{ marginLeft: LABEL_W, height: rows.length * ROW }}>
          {rows.map((m, i) => (
            <div key={m} className="absolute inset-x-0 border-b border-line/70" style={{ top: i * ROW, height: ROW }}>
              <div className="absolute -translate-x-full pr-3 font-mono text-xs leading-[46px] text-soft" style={{ left: 0, width: LABEL_W }}>{m}</div>
            </div>
          ))}
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full w-px bg-ink/[0.06]" style={{ left: t * ppm }} />
          ))}
          {/* downtime windows */}
          {windows.filter((w) => w.machine && w.kind !== "material" && rowOf(w.machine) >= 0).map((w, i) => (
            <motion.div key={`w${i}`} initial={{ opacity: 0 }} animate={{ opacity: mode === "after" ? 1 : 0.0 }} transition={{ duration: 0.5 }}
              className="absolute z-[1] flex items-center overflow-hidden rounded-md border px-2 font-mono text-[10px]"
              style={{
                left: Math.max(0, w.start) * ppm, width: (w.end - Math.max(0, w.start)) * ppm, top: rowOf(w.machine!) * ROW + 3, height: ROW - 6,
                color: w.kind === "down" ? "#B5443A" : "#7A5410",
                borderColor: w.kind === "down" ? "rgba(181,68,58,0.5)" : "rgba(224,163,58,0.6)",
                backgroundImage: `repeating-linear-gradient(135deg, ${w.kind === "down" ? "rgba(181,68,58,0.16)" : "rgba(224,163,58,0.2)"} 0 6px, transparent 6px 12px)`,
              }}>
              <span className="truncate">{w.label}</span>
            </motion.div>
          ))}
          {/* operations */}
          {ops.map((o) => {
            const p = place(o);
            const cls =
              o.added ? "border-terra bg-terra text-ivory"
              : mode === "after" && o.moved ? "border-terra bg-[#F8DDB0] text-ink"
              : o.state === "done" ? "border-line bg-cream text-soft"
              : o.state === "running" ? "border-[#4A5D43] bg-sage text-ivory"
              : o.state === "frozen" ? "border-dashed border-[#7A8F6B] bg-[#E4EBDD] text-ink"
              : "border-[#7A8F6B]/70 bg-[#E4EBDD] text-ink";
            const dim = hover && hover !== o.job;
            return (
              <motion.div key={o.op_id}
                initial={false}
                animate={{ left: p.left, top: p.top, width: p.width, opacity: p.hidden ? 0 : dim ? 0.25 : 1 }}
                transition={spring}
                onMouseEnter={() => setHover(o.job)} onMouseLeave={() => setHover(null)}
                title={`${o.job} · step ${o.seq} · ${o.machine} · ${clock(origin, o.start)}–${clock(origin, o.end)} (${dur(o.end - o.start)})${o.moved ? " · moved" : ""}${o.added ? " · new" : ""}${o.state !== "planned" ? " · " + o.state : ""}`}
                className={`absolute z-[2] flex items-center overflow-hidden rounded-[7px] border px-1.5 font-mono text-[10.5px] font-medium shadow-sm ${cls}`}
                style={{ height: ROW - 12, pointerEvents: p.hidden ? "none" : "auto" }}>
                <span className="truncate">{p.width > 34 ? o.job : ""}</span>
              </motion.div>
            );
          })}
          {nowMin > 0 && (
            <div className="absolute top-0 z-[3] h-full w-px bg-terra" style={{ left: nowMin * ppm }}>
              <span className="absolute -top-0.5 left-1 rounded bg-terra px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-ivory">now</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Legend({ moved = true }: { moved?: boolean }) {
  const chip = (c: string, t: string, extra = "") => (
    <span className="inline-flex items-center gap-2 text-xs text-soft">
      <span className={`h-3 w-5 rounded-[4px] border ${c} ${extra}`} />
      {t}
    </span>
  );
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {chip("border-[#7A8F6B]/70 bg-[#E4EBDD]", "planned")}
      {chip("border-[#4A5D43] bg-sage", "running")}
      {chip("border-dashed border-[#7A8F6B] bg-[#E4EBDD]", "frozen")}
      {chip("border-line bg-cream", "done")}
      {moved && chip("border-terra bg-[#F8DDB0]", "moved")}
      {moved && chip("border-terra bg-terra", "new job")}
      {chip("border-brick/50 bg-brick/15", "machine unavailable")}
    </div>
  );
}
