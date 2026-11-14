import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";

/* ───────────────────────── 1. Data ───────────────────────── */

type JobState = "Running" | "Frozen" | "Queued" | "At risk";
type Job = { id: string; part: string; route: string; qty: number; due: string; rate: string; machine: string; hours: number; state: JobState };

const JOBS: readonly Job[] = [
  { id: "J-1042", part: "Flange adapter, 120 mm", route: "Turning, then drilling", qty: 240, due: "Tue 18:00", rate: "Off-peak", machine: "M1", hours: 6.5, state: "Running" },
  { id: "J-1047", part: "Brake caliper bracket", route: "Milling, then deburr", qty: 90, due: "Tue 22:00", rate: "Peak", machine: "M4", hours: 3, state: "Frozen" },
  { id: "J-1051", part: "Hydraulic manifold block", route: "5-axis milling", qty: 18, due: "Wed 12:00", rate: "Off-peak", machine: "M7", hours: 9.5, state: "At risk" },
  { id: "J-1053", part: "Sheet-metal enclosure", route: "Laser cut, then bend", qty: 60, due: "Wed 17:00", rate: "Standard", machine: "M9", hours: 4, state: "Queued" },
  { id: "J-1058", part: "Injection mould insert", route: "EDM, then polish", qty: 4, due: "Thu 10:00", rate: "Off-peak", machine: "M12", hours: 5.5, state: "Queued" },
  { id: "J-1060", part: "Gear shaft, EN24", route: "Turning, then grinding", qty: 150, due: "Thu 15:00", rate: "Standard", machine: "M2", hours: 7, state: "Running" },
  { id: "J-1064", part: "Valve body casting", route: "Boring, then tapping", qty: 75, due: "Thu 20:00", rate: "Peak", machine: "M3", hours: 4.5, state: "At risk" },
  { id: "J-1069", part: "Motor mount plate", route: "Laser cut, then drill", qty: 320, due: "Fri 11:00", rate: "Off-peak", machine: "M9", hours: 3.5, state: "Queued" },
  { id: "J-1071", part: "Bearing housing", route: "Turning, then milling", qty: 110, due: "Fri 16:00", rate: "Standard", machine: "M5", hours: 5, state: "Frozen" },
  { id: "J-1075", part: "Defence connector shell", route: "Turning, then plating prep", qty: 40, due: "Sat 09:00", rate: "Off-peak", machine: "M2", hours: 2.5, state: "Queued" },
];

/* ───────────────────────── 2. Design tokens ───────────────────────── */

type Shade = { bg: string; border: string; text: string; sub: string; divider: string; dark: boolean };
const SHADES: readonly Shade[] = [
  { bg: "#FFFBF3", border: "#E6DEC8", text: "#2B2118", sub: "#6B5A4A", divider: "#E9E0D2", dark: false },
  { bg: "#F7F1E6", border: "#DED2BF", text: "#2B2118", sub: "#6B5A4A", divider: "#E3D6C4", dark: false },
  { bg: "#EDE2D0", border: "#D0BEA4", text: "#2B2118", sub: "#655746", divider: "#D8C7AC", dark: false },
  { bg: "#DCCBB3", border: "#BCA789", text: "#2B2118", sub: "#554735", divider: "#C8B397", dark: false },
  { bg: "#C8B49A", border: "#A99375", text: "#2B2118", sub: "#4F4132", divider: "#B39D80", dark: false },
  { bg: "#A89174", border: "#8C7457", text: "#FFFBF3", sub: "#F0E7D9", divider: "#B59E7F", dark: true },
  { bg: "#8B7053", border: "#71583E", text: "#FFFBF3", sub: "#E8DCCB", divider: "#9E8263", dark: true },
  { bg: "#6D533B", border: "#59422E", text: "#FFFBF3", sub: "#E4D4C1", divider: "#81664A", dark: true },
  { bg: "#4B3827", border: "#3C2B1D", text: "#FFFBF3", sub: "#D8C5B0", divider: "#624B35", dark: true },
  { bg: "#33251A", border: "#261B13", text: "#FFF8EC", sub: "#D4BEA5", divider: "#4D3927", dark: true },
];

type Tone = { bg: string; fg: string; bd: string };
const TONES: Record<JobState, { light: Tone; dark: Tone }> = {
  Running: { light: { bg: "#E5F2E8", fg: "#2F6542", bd: "#B7D3BD" }, dark: { bg: "#284332", fg: "#D5F1DA", bd: "#52755D" } },
  Frozen: { light: { bg: "#F5E9CE", fg: "#74551A", bd: "#DFCAA0" }, dark: { bg: "#54421F", fg: "#F7E7BD", bd: "#806B3F" } },
  Queued: { light: { bg: "#EFEAE2", fg: "#5D5144", bd: "#D9D0C3" }, dark: { bg: "#514338", fg: "#F0E8DD", bd: "#756452" } },
  "At risk": { light: { bg: "#F8E5E1", fg: "#8D3E34", bd: "#E6BDB6" }, dark: { bg: "#5A302B", fg: "#FFE2DC", bd: "#875148" } },
};
const STATE_COPY: Record<JobState, string> = {
  Running: "Work is underway.",
  Frozen: "Protected for 60 minutes on an available machine.",
  Queued: "Not started, so the scheduler may move it.",
  "At risk": "Due date may slip and needs manager review.",
};
const MOVABLE: Record<JobState, string> = { Running: "No", Frozen: "No, 60 min", Queued: "Yes", "At risk": "Review" };
const STATES: readonly JobState[] = ["Running", "Frozen", "Queued", "At risk"];

const SHADOW = "0 24px 50px -30px rgba(43,33,24,.45), 0 4px 14px -8px rgba(43,33,24,.3), inset 0 1px 0 rgba(255,255,255,.35)";
const SHADOW_ACTIVE = "0 36px 70px -28px rgba(43,33,24,.6), 0 8px 22px -10px rgba(43,33,24,.4), inset 0 1px 0 rgba(255,255,255,.4)";

/* ───────────────────────── 3. Motion maths ───────────────────────── */

const AUTO_SPEED = 52;   // px per second: roughly six seconds per card
const GAP = 32;          // empty space between cards, so they can never overlap
const TILT_DEG = 16;
const PERSPECTIVE = 1400;
const CARD_H = 300;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrapCentered = (v: number, total: number) => ((((v + total / 2) % total) + total) % total) - total / 2;

/* ───────────────────────── 4. Engine hook ─────────────────────────
   All per-frame work writes straight to element styles. React only
   re-renders when the focused card changes or a drag starts/ends. */

function useCarousel(count: number, paused: boolean, reduced: boolean) {
  const stageRef = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const api = useRef({ wake: () => {}, snap: () => {} });
  const m = useRef({
    offset: 0, vel: 0, target: null as number | null, pitch: 344, width: 312, stageW: 1200,
    hovered: false, focused: false, paused, reduced, dragging: false, moved: false,
    startX: 0, lastX: 0, lastT: 0, inView: false, raf: 0, last: 0, active: 0,
  });
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const s = m.current;

    const render = () => {
      const total = count * s.pitch, limit = s.stageW / 2 + s.width;
      let best = 0, bestAbs = Infinity;
      for (let i = 0; i < count; i++) {
        const el = els.current[i];
        if (!el) continue;
        const x = wrapCentered(i * s.pitch - s.offset, total), ax = Math.abs(x);
        if (ax < bestAbs) { bestAbs = ax; best = i; }
        const show = ax < limit;
        if (show !== (el.dataset.on === "1")) { el.dataset.on = show ? "1" : "0"; el.style.visibility = show ? "visible" : "hidden"; }
        if (!show) continue;
        const near = smooth(clamp(ax / (s.pitch * 1.6), 0, 1));
        const tilt = -Math.sign(x) * TILT_DEG * smooth(clamp(ax / s.pitch, 0, 1));
        el.style.transform = `perspective(${PERSPECTIVE}px) translate3d(${x.toFixed(2)}px,0,${(-ax * 0.1).toFixed(1)}px) rotateY(${tilt.toFixed(2)}deg) scale(${(1 - 0.12 * near).toFixed(4)})`;
        el.style.opacity = (1 - 0.4 * near).toFixed(3);
        el.style.zIndex = String(1000 - Math.round(ax));
      }
      if (best !== s.active) { s.active = best; setActive(best); }
    };

    const tick = (now: number) => {
      s.raf = 0;
      if (!s.inView || document.hidden) { s.last = 0; return; }
      const dt = s.last ? Math.min((now - s.last) / 1000, 0.05) : 0;
      s.last = now;
      const holding = s.paused || s.hovered || s.focused;
      if (!s.dragging) {
        if (s.target !== null) {
          const diff = s.target - s.offset;
          if (s.reduced || Math.abs(diff) < 0.2) { s.offset = s.target; s.target = null; s.vel = 0; }
          else s.offset += diff * (1 - Math.exp(-dt * 7));
        } else {
          const goal = holding ? 0 : AUTO_SPEED;
          s.vel += (goal - s.vel) * (1 - Math.exp(-dt * (holding ? 5 : 1.6)));
          s.offset += s.vel * dt;
        }
      }
      render();
      const idle = !s.dragging && s.target === null && holding && Math.abs(s.vel) < 0.05;
      if (idle) { s.vel = 0; s.last = 0; } else s.raf = requestAnimationFrame(tick);
    };

    const wake = () => { if (s.inView && !document.hidden && !s.raf) s.raf = requestAnimationFrame(tick); };
    const snap = () => { s.target = Math.round(s.offset / s.pitch) * s.pitch; s.vel = 0; wake(); };
    api.current = { wake, snap };

    const measure = () => {
      const old = s.pitch, idx = s.offset / old, tgt = s.target === null ? null : s.target / old;
      s.stageW = stage.clientWidth;
      s.width = clamp(s.stageW * 0.78, 252, 316);
      s.pitch = s.width + GAP;
      s.offset = idx * s.pitch;
      s.target = tgt === null ? null : tgt * s.pitch;
      stage.style.setProperty("--cw", `${s.width}px`);
      render(); wake();
    };
    const ro = new ResizeObserver(measure); ro.observe(stage); measure();
    const io = new IntersectionObserver(([e]) => { s.inView = e.isIntersecting; if (s.inView) wake(); }, { threshold: 0.05 });
    io.observe(stage);
    const vis = () => { if (document.hidden) s.last = 0; else wake(); };
    document.addEventListener("visibilitychange", vis);
    return () => { ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis); cancelAnimationFrame(s.raf); s.raf = 0; };
  }, [count]);

  useEffect(() => {
    const s = m.current;
    s.paused = paused; s.reduced = reduced;
    if (paused) api.current.snap(); else api.current.wake();
  }, [paused, reduced]);

  const step = useCallback((delta: number) => {
    const s = m.current;
    const base = Math.round((s.target ?? s.offset) / s.pitch);
    s.target = (base + delta) * s.pitch; s.vel = 0; api.current.wake();
  }, []);
  const goTo = useCallback((i: number) => {
    const s = m.current;
    s.target = s.offset + wrapCentered(i * s.pitch - s.offset, count * s.pitch); s.vel = 0; api.current.wake();
  }, [count]);
  const register = useCallback((i: number, el: HTMLDivElement | null) => { els.current[i] = el; }, []);
  const setFocused = useCallback((v: boolean) => { m.current.focused = v; api.current.wake(); }, []);

  const bind = {
    onPointerEnter: (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType === "mouse") { m.current.hovered = true; api.current.wake(); } },
    onPointerLeave: () => { m.current.hovered = false; api.current.wake(); },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const s = m.current;
      Object.assign(s, { dragging: true, moved: false, target: null, vel: 0, startX: e.clientX, lastX: e.clientX, lastT: performance.now() });
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const s = m.current;
      if (!s.dragging) return;
      if (!s.moved) {
        if (Math.abs(e.clientX - s.startX) < 5) return;
        s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); setDragging(true);
      }
      const now = performance.now(), dt = Math.max(1, now - s.lastT) / 1000, dx = e.clientX - s.lastX;
      s.offset -= dx; s.vel = clamp(s.vel + (-dx / dt - s.vel) * 0.3, -2600, 2600);
      s.lastX = e.clientX; s.lastT = now; api.current.wake();
    },
    onPointerUp: () => {
      const s = m.current;
      if (!s.dragging) return;
      s.dragging = false;
      if (s.moved) {
        const fling = performance.now() - s.lastT > 80 ? 0 : s.vel;
        s.target = Math.round((s.offset + fling * 0.2) / s.pitch) * s.pitch; s.vel = 0;
        setDragging(false);
      }
      api.current.wake();
    },
  };
  return { stageRef, register, active, dragging, step, goTo, setFocused, bind };
}

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const q = window.matchMedia(query), on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ───────────────────────── 5. Presentational pieces ───────────────────────── */

function StateBadge({ state, dark }: { state: JobState; dark: boolean }) {
  const t = TONES[state][dark ? "dark" : "light"];
  return (
    <span style={{ color: dark ? t.fg : t.fg }} className="text-[13px] font-semibold underline decoration-current/30 decoration-2 underline-offset-4">{state}</span>
  );
}

function Legend() {
  return (
    <ul className="mt-7 grid gap-x-8 gap-y-1.5 sm:grid-cols-2" aria-label="Job state guide">
      {STATES.map((st) => (
        <li key={st} className="text-[13px] text-soft">
          <span className="font-semibold" style={{ color: TONES[st].light.fg }}>{st}</span>
          {" "}{STATE_COPY[st].replace(/\.$/, "").toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

type CardProps = { job: Job; shade: Shade; index: number; active: boolean; register: (i: number, el: HTMLDivElement | null) => void; onSelect: (i: number) => void };

const JobCard = memo(function JobCard({ job, shade, index, active, register, onSelect }: CardProps) {
  const facts: [string, string][] = [
    ["Order qty", String(job.qty)], ["Due", job.due], ["Energy rate", job.rate],
    ["Machine", job.machine], ["Run time", `${job.hours} h`], ["Can move", MOVABLE[job.state]],
  ];
  return (
    <div
      ref={(el) => register(index, el)}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${JOBS.length}: ${job.id}, ${job.part}, ${job.state}`}
      style={{ position: "absolute", left: "50%", top: "50%", width: "var(--cw)", height: CARD_H, marginLeft: "calc(var(--cw) / -2)", marginTop: -CARD_H / 2, visibility: "hidden", willChange: "transform, opacity", backfaceVisibility: "hidden" }}
    >
      <article
        onClick={() => onSelect(index)}
        style={{ backgroundColor: shade.bg, borderColor: shade.border, color: shade.text, boxShadow: active ? SHADOW_ACTIVE : SHADOW }}
        className="flex h-full w-full flex-col rounded-[26px] border p-6 transition-shadow duration-500"
      >
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: shade.sub }} className="font-mono text-xs tracking-wide">{job.id}</span>
          <StateBadge state={job.state} dark={shade.dark} />
        </div>
        <div className="mt-4 min-h-0 flex-1">
          <h3 className="font-display text-[24px] leading-[1.12] tracking-[-0.02em]">{job.part}</h3>
          <p style={{ color: shade.sub }} className="mt-1.5 text-[13px] leading-snug">{job.route}</p>
        </div>
        <dl style={{ borderColor: shade.divider }} className="grid grid-cols-3 gap-x-3 gap-y-2.5 border-t pt-3.5">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt style={{ color: shade.sub }} className="text-[11px]">{k}</dt>
              <dd className="mt-0.5 truncate text-[13px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
});

/* ───────────────────────── 6. Section ───────────────────────── */

export function JobCarousel() {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(reduced);
  useEffect(() => { if (reduced) setPaused(true); }, [reduced]);
  const { stageRef, register, active, dragging, step, goTo, setFocused, bind } = useCarousel(JOBS.length, paused, reduced);
  const job = JOBS[active];

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const move: Record<string, () => void> = { ArrowRight: () => step(1), ArrowLeft: () => step(-1), Home: () => goTo(0), End: () => goTo(JOBS.length - 1) };
    if (move[e.key]) { e.preventDefault(); move[e.key](); }
  };
  const circle = "grid h-9 w-9 place-items-center rounded-full border border-line bg-ivory text-ink transition-colors hover:bg-ink/[0.05]";

  return (
    <section
      id="jobs"
      className="scroll-mt-24 overflow-hidden py-20 sm:py-24"
      onFocusCapture={(e: FocusEvent<HTMLElement>) => { if ((e.target as HTMLElement).matches(":focus-visible")) setFocused(true); }}
      onBlurCapture={(e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow mb-4">A sample shop floor · illustrative, not benchmark data</p>
        <h2 className="h-display max-w-3xl text-4xl md:text-5xl">A day of job cards, as the planner sees them.</h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-soft sm:text-lg">
          Ten sample orders from a synthetic 15-machine CNC and fabrication shop. Frozen jobs are protected for 60 minutes. Queued jobs are free to move when something breaks.
        </p>
        <Legend />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-full bg-terra/10 px-2.5 py-1 font-mono text-[11px] text-terra">{String(active + 1).padStart(2, "0")} / {String(JOBS.length).padStart(2, "0")}</span>
            <p className="truncate text-sm text-ink"><span className="font-medium">{job.id}</span> · {job.part}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={circle} onClick={() => step(-1)} aria-label="Previous job card">←</button>
            <button type="button" className={circle} onClick={() => step(1)} aria-label="Next job card">→</button>
            <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="ml-1 rounded-full border border-line bg-ivory px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-ink/[0.05]">
              {paused ? "Play" : "Pause"}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Sample production job cards"
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...bind}
        className={`relative mx-auto mt-2 h-[400px] w-full max-w-[1400px] touch-pan-y select-none overflow-hidden outline-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)" }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] inset-y-[14%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(200,100,59,0.12),rgba(224,163,58,0.05)_40%,transparent_72%)]" />
        {JOBS.map((j, i) => (
          <JobCard key={j.id} job={j} shade={SHADES[i % SHADES.length]} index={i} active={i === active} register={register} onSelect={goTo} />
        ))}
      </div>

      <div className="mx-auto mt-2 flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
        <p className="max-w-xl text-sm leading-relaxed text-soft"><span className="font-medium text-ink">{job.state}:</span> {STATE_COPY[job.state]}</p>
        <div className="flex items-center gap-0.5" role="group" aria-label="Choose a job card">
          {JOBS.map((j, i) => (
            <button key={j.id} type="button" onClick={() => goTo(i)} aria-label={`Show ${j.id}`} aria-current={i === active || undefined} className="grid h-6 w-5 place-items-center">
              <span className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-terra" : "w-1.5 bg-ink/25"}`} />
            </button>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-6xl px-6 font-mono text-[11px] text-soft/80">Drag or swipe · ← / → to step · hover or keyboard focus pauses the rotation</p>
    </section>
  );
}

export default JobCarousel;