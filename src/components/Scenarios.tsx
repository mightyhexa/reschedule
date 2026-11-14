import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Gantt } from "./Gantt";
import { build } from "../lib/schedule";
import type { Scenario } from "../lib/schedule";
import { useProgress } from "../lib/useProgress";
import { DemoButton } from "../app/DemoButton";

/* ------------------------------------------------------------------ */
/*  1. Section 6 Brief: Slash-Command Disruption Cloud Data            */
/* ------------------------------------------------------------------ */

interface SlashCmd {
  cmd: string;
  tier: 1 | 2 | 3; // 1 = large serif, 2 = medium, 3 = small
  x: number; // % across the stage (desktop, kept inside 16-84)
  y: number;
  mx: number; // same, for narrow screens
  my: number;
  scenario: Scenario;
  sentence: string; // one plain-English line, no jargon
}

const SLASH_COMMANDS: readonly SlashCmd[] = [
  { cmd: "/machine-stops", tier: 1, x: 24, y: 20, mx: 34, my: 8, scenario: "breakdown", sentence: "A CNC machine breaks down mid-shift for 3 hours." },
  { cmd: "/urgent-order", tier: 1, x: 56, y: 14, mx: 66, my: 21, scenario: "rush", sentence: "A big customer calls needing a rush part today." },
  { cmd: "/material-late", tier: 1, x: 80, y: 38, mx: 34, my: 34, scenario: "material", sentence: "Raw steel truck is stuck in traffic for 4 hours." },
  { cmd: "/worker-absent", tier: 2, x: 20, y: 48, mx: 66, my: 47, scenario: "breakdown", sentence: "The morning lathe operator calls in sick." },
  { cmd: "/power-cut", tier: 2, x: 48, y: 46, mx: 34, my: 60, scenario: "breakdown", sentence: "Electricity goes out across the shop for 90 minutes." },
  { cmd: "/job-running-slow", tier: 2, x: 68, y: 66, mx: 66, my: 73, scenario: "breakdown", sentence: "A tough cut takes 45 minutes longer than planned." },
  { cmd: "/keep-setups-locked", tier: 3, x: 30, y: 78, mx: 34, my: 86, scenario: "breakdown", sentence: "Jobs already running stay 100% untouched." },
  { cmd: "/approve-before-change", tier: 3, x: 62, y: 90, mx: 66, my: 97, scenario: "rush", sentence: "Nothing changes on the floor until you click Yes." },
];

/* ------------------------------------------------------------------ */
/*  2. Three Painterly Disruption Showcases (Section 11 Brief)         */
/* ------------------------------------------------------------------ */

interface Item {
  id: Scenario;
  roman: string;
  time: string;
  title: string;
  summary: string;
  note: string;
  backdrop: string;
  facts: [string, string][];
  does: string[];
}

const ITEMS: Item[] = [
  {
    id: "breakdown",
    roman: "I",
    time: "10:15 AM",
    title: "Machine breakdown",
    summary:
      "A spindle motor overheats on Machine 3, stopping the line for four hours.",
    note: "“Machine M3 just tripped. Motor overheated—maintenance says four hours.”",
    backdrop:
      "https://cdn.shopify.com/s/files/1/0951/3130/4218/files/BG-R.png?v=1761935402&width=800",
    facts: [
      ["Affected machine", "M3 (4 hours)"],
      ["Healthy machines", "4 of 5 untouched"],
      ["Floor impact", "Only 4 waiting jobs slide"],
    ],
    does: [
      "Leaves all 20 jobs on Machines 1, 2, 4, and 5 in their exact morning slots.",
      "Slides only the 4 jobs waiting behind Machine 3 by four hours.",
      "Shows the exact delivery shift before the floor schedule updates.",
    ],
  },
  {
    id: "rush",
    roman: "II",
    time: "11:30 AM",
    title: "Urgent customer order",
    summary:
      "A key customer needs a three-hour replacement part cut on Machine 2 today.",
    note: "“Need Rush Job R on Machine 2 right away—three hours of run time.”",
    backdrop:
      "https://cdn.shopify.com/s/files/1/0951/3130/4218/files/BG-Y.png?v=1762366719&width=800",
    facts: [
      ["Target machine", "M2 (+3 hours)"],
      ["Healthy machines", "4 of 5 untouched"],
      ["Floor impact", "1 added · 4 nudged"],
    ],
    does: [
      "Places Rush Job R into Machine 2 as soon as its current job finishes.",
      "Nudges only the 4 jobs queued behind it on Machine 2.",
      "Leaves every other machine and operator untouched.",
    ],
  },
  {
    id: "material",
    roman: "III",
    time: "01:00 PM",
    title: "Late raw material",
    summary:
      "Steel stock for Job E is stuck in transit and will not reach Machine 2 until hour 9.",
    note: "“Bar stock for Job E is delayed—won’t be unloaded until hour nine.”",
    backdrop:
      "https://cdn.shopify.com/s/files/1/0951/3130/4218/files/BG-B1.png?v=1762365507&width=800",
    facts: [
      ["Delayed job", "Job E on M2"],
      ["Smart swap", "Swaps Job E with Job B"],
      ["Floor impact", "Only 2 jobs swap places"],
    ],
    does: [
      "Pulls ready Job B forward so Machine 2 never sits idle waiting for stock.",
      "Swaps just two jobs on Machine 2 instead of reshuffling all 25 operations.",
      "Keeps the rest of the shift running without interruption.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  3. Command constellation: open canvas, cards expand in place       */
/* ------------------------------------------------------------------ */

function ClaySprite({ kind, delay, x, rot }: { kind: "gear" | "lock" | "check"; delay: number; x: number; rot: number }) {
  const reduce = useReducedMotion();
  const fill = kind === "gear" ? ["#E58A5E", "#B9532D"] : kind === "lock" ? ["#F0BE5C", "#C48A1E"] : ["#9DB38C", "#5F7650"];
  const id = `cs-${kind}`;
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute top-0"
      style={{ left: x }}
      initial={{ y: 8, opacity: 0, scale: 0.4, rotate: rot - 40 }}
      animate={reduce ? { y: -20, opacity: 1, scale: 1, rotate: rot } : { y: [-8, -26, -18, -28], opacity: 1, scale: 1, rotate: [rot, rot + 14, rot - 8, rot + 10] }}
      transition={reduce ? { duration: 0.2 } : { delay, duration: 3.2, ease: "easeInOut", repeat: Infinity, repeatType: "mirror", opacity: { duration: 0.25, delay } }}
    >
      <svg width="30" height="30" viewBox="0 0 30 30">
        <defs>
          <radialGradient id={id} cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor={fill[0]} />
            <stop offset="1" stopColor={fill[1]} />
          </radialGradient>
        </defs>
        {kind === "gear" && (
          <g>
            <path d="M15 3l2.6 2.8 3.8-.8 1.2 3.7 3.7 1.3-.9 3.8L28 15l-2.6 2.6.9 3.8-3.7 1.2-1.3 3.8-3.8-.9L15 28l-2.6-2.7-3.8.9-1.2-3.8-3.7-1.2.9-3.8L2 15l2.7-2.6-.9-3.8 3.7-1.3 1.3-3.7 3.8.9z" fill={`url(#${id})`} stroke="#8C3F1F" strokeOpacity=".35" />
            <circle cx="15" cy="15" r="4.6" fill="#F7F1E6" fillOpacity=".92" />
          </g>
        )}
        {kind === "lock" && (
          <g>
            <path d="M9.5 13V9.5a5.5 5.5 0 0 1 11 0V13" fill="none" stroke="#A8761A" strokeWidth="3" strokeLinecap="round" />
            <rect x="5" y="12" width="20" height="15" rx="5" fill={`url(#${id})`} stroke="#8C5E0F" strokeOpacity=".35" />
            <circle cx="15" cy="19" r="2.3" fill="#5A3D0A" fillOpacity=".7" />
          </g>
        )}
        {kind === "check" && (
          <g>
            <path d="M15 3c6.5-.3 12 4.8 12 11.6S22 27 14.6 27 3 21.6 3 14.8 8.8 3.3 15 3z" fill={`url(#${id})`} stroke="#44583A" strokeOpacity=".35" />
            <path d="M9.5 15.3l4 4 7.2-8" fill="none" stroke="#F7F1E6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        <ellipse cx="11" cy="8" rx="4" ry="2" fill="#fff" fillOpacity=".38" />
      </svg>
    </motion.span>
  );
}

const CARD_W = 272;
const CARD_H = 168;

function SlashCommandCloud({ onSelectScenario }: { onSelectScenario: (s: Scenario) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [activeIdx, setActiveIdx] = useState(0);
  const activeRef = useRef(0);
  const pts = useRef<{ x: number; y: number }[]>([]);
  const edges = useRef<[number, number][]>([]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  const narrow = size.w > 0 && size.w < 640;

  // Word positions: stay inside the 16-84% safe band, then clamp by the real width of each word so nothing can ever be cut off.
  const placed = SLASH_COMMANDS.map((c) => {
    const px = narrow ? c.mx : c.x;
    const py = narrow ? c.my : c.y;
    const fs = narrow ? 14 : c.tier === 1 ? 26 : c.tier === 2 ? 20 : 16;
    const ww = c.cmd.length * fs * 0.54 + 28;
    const w = size.w || 1;
    const h = size.h || 1;
    const cx = Math.min(Math.max((px / 100) * w, ww / 2 + 6), w - ww / 2 - 6);
    const cy = (py / 100) * h;
    return { cx, cy, fs, ww };
  });
  pts.current = placed.map((p) => ({ x: p.cx, y: p.cy }));
  edges.current = (() => {
    const out: [number, number][] = [];
    placed.forEach((a, i) => {
      placed
        .map((b, j) => ({ j, d: Math.hypot(a.cx - b.cx, (a.cy - b.cy) * 1.6) }))
        .filter((x) => x.j !== i)
        .sort((m, n) => m.d - n.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          if (!out.some(([p, q]) => (p === i && q === j) || (p === j && q === i))) out.push([i, j]);
        });
    });
    return out;
  })();

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const act = activeRef.current;
      for (const [i, j] of edges.current) {
        const a = pts.current[i];
        const b = pts.current[j];
        if (!a || !b) continue;
        const hot = i === act || j === act;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = hot ? "rgba(200,100,59,0.5)" : "rgba(43,33,24,0.16)";
        ctx.lineWidth = hot ? 1.4 : 0.9;
        ctx.stroke();
      }
      for (const p of pts.current) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(43,33,24,0.3)";
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const activate = (i: number) => {
    activeRef.current = i;
    setActiveIdx(i);
  };

  const cmd = SLASH_COMMANDS[activeIdx];
  const ap = placed[activeIdx];
  const cardW = Math.min(CARD_W, Math.max(200, size.w - 16));
  const cardX = Math.min(Math.max(ap.cx, cardW / 2 + 8), Math.max(size.w - cardW / 2 - 8, cardW / 2 + 8));
  const cardY = Math.min(Math.max(ap.cy, CARD_H / 2 + 34), Math.max(size.h - CARD_H / 2 - 6, CARD_H / 2 + 34));

  return (
    <div ref={boxRef} className="relative mt-12 h-[460px] w-full overflow-visible sm:h-[400px]" onMouseLeave={() => undefined}>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

      {SLASH_COMMANDS.map((c, i) => {
        const p = placed[i];
        const isCurrent = i === activeIdx;
        return (
          <button
            key={c.cmd}
            type="button"
            onMouseEnter={() => activate(i)}
            onFocus={() => activate(i)}
            onClick={() => activate(i)}
            aria-label={`${c.cmd}: ${c.sentence}`}
            style={{ left: p.cx, top: p.cy, fontSize: p.fs, opacity: isCurrent ? 0 : undefined }}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 font-display italic text-ink transition-colors duration-200 hover:text-terra ${c.tier === 3 ? "opacity-75" : ""}`}
          >
            {c.cmd}
          </button>
        );
      })}

      {/* The active word expands right where it sits */}
      <div
        key={cmd.cmd}
        className="absolute z-30"
        style={{ left: cardX, top: cardY, width: cardW, height: CARD_H, transform: "translate(-50%, -50%)" }}
      >
        <ClaySprite kind="gear" delay={0} x={cardW * 0.16} rot={-8} />
        <ClaySprite kind="lock" delay={0.35} x={cardW * 0.46} rot={6} />
        <ClaySprite kind="check" delay={0.7} x={cardW * 0.74} rot={12} />
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex h-full flex-col justify-between bg-[#1E1E16] px-4 py-3.5 text-[#F6F4EC] shadow-lift"
          style={{ borderRadius: 3, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), 0 30px 50px -28px rgba(30,30,22,0.7)" }}
        >
          <p className="text-[13px] leading-snug text-[#D8D0C2]">{cmd.sentence}</p>
          <button
            type="button"
            onClick={() => onSelectScenario(cmd.scenario)}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F6F4EC] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#1E1E16] transition-transform hover:scale-105"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 1.5l8 4.5-8 4.5z" fill="currentColor" />
            </svg>
            Simulate this →
          </button>
          <div className="font-display text-[26px] italic leading-none text-[#E0A33A]">{cmd.cmd}</div>
        </motion.div>
      </div>
    </div>
  );
}

function Counter({
  value,
}: {
  value: ReturnType<typeof useTransform<number, number>>;
}) {
  return <motion.span>{value}</motion.span>;
}

/* ------------------------------------------------------------------ */
/*  4. Painterly Backdrop Card with Overlapping Floating Chip         */
/* ------------------------------------------------------------------ */

function PainterlyCard({
  item,
  dimmed,
  onHover,
  onLeave,
  onOpen,
}: {
  item: Item;
  dimmed: boolean;
  onHover: () => void;
  onLeave: () => void;
  onOpen: () => void;
}) {
  const stats = useMemo(() => build(item.id), [item.id]);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(30);
  const sx = useSpring(rx, { stiffness: 240, damping: 22, mass: 0.5 });
  const sy = useSpring(ry, { stiffness: 240, damping: 22, mass: 0.5 });
  const glare = useMotionTemplate`radial-gradient(380px circle at ${gx}% ${gy}%, rgba(255,251,243,0.75), transparent 60%)`;

  function move(e: PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 7);
    rx.set((0.5 - py) * 6);
    gx.set(px * 100);
    gy.set(py * 100);
  }
  function reset() {
    rx.set(0);
    ry.set(0);
    gx.set(50);
    gy.set(30);
    onLeave();
  }

  return (
    <motion.div
      layoutId={`card-${item.id}`}
      className="gpu-layer relative pt-3 [perspective:1200px]"
      animate={{
        opacity: dimmed ? 0.6 : 1,
        scale: dimmed ? 0.985 : 1,
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >

      <motion.button
        type="button"
        onClick={onOpen}
        onPointerEnter={onHover}
        onPointerMove={move}
        onPointerLeave={reset}
        whileTap={{ scale: 0.985 }}
        style={{
          rotateX: sx,
          rotateY: sy,
          transformStyle: "preserve-3d",
          borderRadius: 28,
        }}
        className="gpu-layer group relative flex h-full w-full flex-col justify-between overflow-hidden border border-line bg-ivory text-left shadow-card transition-shadow duration-500 hover:shadow-lift"
      >
        <motion.span
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: glare }}
        />

        {/* Top Painterly Canvas Plate + Mini Live Preview */}
        <div className="relative h-40 w-full overflow-hidden border-b border-line bg-[#262616]">
          <img
            src={item.backdrop}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-85 transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1D1619]/90 via-[#1D1619]/30 to-transparent" />

          {/* Framed Mini Floor Snapshot Floating Inside the Painting */}
          <div className="absolute inset-x-4 bottom-3 rounded-xl border border-white/20 bg-[#1D1619]/85 p-3 text-[#F6F4EC] backdrop-blur-sm">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-[#E0A33A]">
                {item.roman} · {item.time}
              </span>
              <span className="text-[#D5F1DA]">
                {stats.total - stats.stableMoved} locked · {stats.stableMoved}{" "}
                slid
              </span>
            </div>
            <p className="mt-1 truncate font-display text-sm italic text-white/90">
              {item.note}
            </p>
          </div>
        </div>

        {/* Editorial Body */}
        <div className="flex flex-1 flex-col justify-between p-6">
          <div>
            <motion.h3
              layoutId={`title-${item.id}`}
              className="h-display text-[28px] text-ink"
            >
              {item.title}
            </motion.h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-soft">
              {item.summary}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-xs font-semibold text-ink">
            <span>Open interactive repair sheet</span>
            <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </div>
        </div>
      </motion.button>
    </motion.div>
  );
}

function Sheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const data = useMemo(() => build(item.id), [item.id]);
  const [confirmed, setConfirmed] = useState(true);
  const pr = useProgress(confirmed ? 1 : 0, 1.15);
  const winOp = useProgress(confirmed ? 1 : 0.15, 0.5);
  const nC = useTransform(pr, (v) => Math.round(v * data.naiveMoved));
  const sC = useTransform(pr, (v) => Math.round(v * data.stableMoved));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <motion.div
        className="gpu-layer absolute inset-0 bg-ink/55 backdrop-blur-[4px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        layoutId={`card-${item.id}`}
        className="gpu-layer relative max-h-full w-full max-w-5xl overflow-y-auto border border-line bg-ivory shadow-lift"
        style={{ borderRadius: 32 }}
      >
        <div className="grid gap-8 p-7 md:grid-cols-[0.88fr_1.12fr] md:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-xs text-soft">
                  <span className="text-terra">Scenario {item.roman}</span>
                  <span>·</span>
                  <span>{item.time}</span>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full border border-line px-3.5 py-1.5 text-xs text-soft transition-colors hover:bg-ink/5 hover:text-ink"
                  aria-label="Close"
                >
                  Close ✕
                </button>
              </div>

              <motion.h3
                layoutId={`title-${item.id}`}
                className="h-display mt-6 text-3xl text-ink sm:text-4xl"
              >
                {item.title}
              </motion.h3>

              <div className="mt-5 rounded-2xl border border-line bg-cream/70 p-4">
                <span className="text-[12.5px] font-medium text-soft">
                  Message from the floor
                </span>
                <p className="mt-1.5 font-display text-lg italic leading-snug text-ink">
                  {item.note}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-2.5">
                {item.facts.map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-xl border border-line bg-ivory p-3"
                  >
                    <dt className="font-mono text-[10px] text-soft">{k}</dt>
                    <dd className="mt-1 text-xs font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                {item.does.map((d) => (
                  <li
                    key={d}
                    className="flex gap-3 text-[14.5px] leading-relaxed text-soft"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <button
                onClick={() => setConfirmed((c) => !c)}
                className="rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-ivory btn-fill"
              >
                {confirmed ? "Show original morning plan" : "Preview repair"}
              </button>
              <span className="text-[13px] text-soft">
                {confirmed ? "Showing the repaired schedule" : "Showing the original morning plan"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#3D3024] bg-[#211A14] p-5 text-[#FAF3E8] shadow-card">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-[15px] font-medium text-[#FAF3E8]">ReSchedule repair</span>
                <span className="text-sm text-[#E6DAC8]">
                  <Counter value={sC} /> of {data.total} jobs moved
                </span>
              </div>
              <Gantt
                placed={data.stable}
                progress={pr}
                windows={data.windows}
                windowOpacity={winOp}
                rowH={22}
                variant="dark"
              />
            </div>

            <div className="rounded-[24px] border border-line bg-cream/65 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[15px] font-medium text-ink">Rebuild from scratch</span>
                <span className="text-sm text-soft">
                  <Counter value={nC} /> of {data.total} jobs moved
                </span>
              </div>
              <Gantt
                placed={data.naive}
                progress={pr}
                windows={data.windows}
                windowOpacity={winOp}
                rowH={19}
                variant="light"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function Scenarios() {
  const [open, setOpen] = useState<Scenario | null>(null);
  const [hovered, setHovered] = useState<Scenario | null>(null);
  const current = ITEMS.find((i) => i.id === open) ?? null;

  return (
    <section
      id="try"
      data-chrome="light"
      className="mx-auto max-w-6xl px-6 py-28 xl:pl-28"
    >
      <div className="flex flex-col justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2.5 font-mono text-xs text-soft">
            <span className="text-terra">V</span>
            <span>·</span>
            <span>Interactive Floor Disruptions</span>
          </div>
          <h2 className="h-display max-w-2xl text-4xl text-ink sm:text-5xl">
            <span className="swash">P</span>ick what breaks. Watch how little
            moves.
          </h2>
        </div>
        <p className="max-w-md text-base leading-relaxed text-soft">
          Hover any situation below to see what it means, then press Simulate. Or open a painted plate to compare a small repair with a full rebuild.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-ivory/70 px-5 py-4">
        <DemoButton />
        <p className="max-w-md text-sm text-soft">Want to try it for real? This opens a private demo shop in one click: jobs, a live plan, and a broken machine waiting for you.</p>
      </div>

      {/* Section 6 Brief: Interactive Slash-Command Disruption Cloud */}
      <SlashCommandCloud onSelectScenario={(s) => setOpen(s)} />

      {/* Section 11 Brief: Painterly Mock Cards with Overlapping Chips */}
      <div className="mt-12 grid gap-7 md:grid-cols-3">
        {ITEMS.map((it) => (
          <PainterlyCard
            key={it.id}
            item={it}
            dimmed={hovered !== null && hovered !== it.id}
            onHover={() => setHovered(it.id)}
            onLeave={() => setHovered(null)}
            onOpen={() => setOpen(it.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {current && (
          <Sheet
            key={current.id}
            item={current}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}