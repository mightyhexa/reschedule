import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { MotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Plain-language content (Zero solver jargon, no sidelines)          */
/* ------------------------------------------------------------------ */

type Pose = "wave" | "point" | "clip";

const STEPS: {
  roman: string;
  n: string;
  short: string;
  title: string;
  plain: string;
  rule: string;
  bubble: string;
  pose: Pose;
}[] = [
  {
    roman: "I",
    n: "01",
    short: "Protect",
    title: "Lock what is already running",
    plain:
      "Jobs already on a machine—or staged to start within the next hour—stay right where they are. Operators never tear down a working setup.",
    rule: "Next 60 minutes protected",
    bubble: "Hands off! Running jobs stay locked.",
    pose: "wave",
  },
  {
    roman: "II",
    n: "02",
    short: "Slide",
    title: "Slide only the blocked line",
    plain:
      "When Machine 3 stops, only the jobs waiting in line behind Machine 3 get a new slot. The other four machines keep their morning plan.",
    rule: "Healthy machines untouched",
    bubble: "Only the blocked line moves.",
    pose: "point",
  },
  {
    roman: "III",
    n: "03",
    short: "Approve",
    title: "Weigh the trade-off, then approve",
    plain:
      "Choose whether to move fewer jobs for floor calm or nudge extra work to protect a tight delivery date. Nothing changes until you click approve.",
    rule: "Manager sign-off required",
    bubble: "You make the call before the floor sees it.",
    pose: "clip",
  },
];

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function useDesktop() {
  const [d, setD] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true
  );
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const f = () => setD(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Tactile building blocks                                            */
/* ------------------------------------------------------------------ */

const CLAY = {
  sage: "bg-gradient-to-b from-[#AEC09E] to-[#7E956E]",
  amber: "bg-gradient-to-b from-[#F5C874] to-[#DE9C2A]",
  terra: "bg-gradient-to-b from-[#E28E66] to-[#B5502B]",
};
const CLAY_SHADOW =
  "shadow-[inset_0_2px_0_rgba(255,255,255,0.5),inset_0_-4px_0_rgba(0,0,0,0.13),0_7px_8px_-5px_rgba(43,33,24,0.35)]";

function Clay({
  tone,
  className = "",
  children,
}: {
  tone: keyof typeof CLAY;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-[10px] ${CLAY[tone]} ${CLAY_SHADOW} ${className}`}>
      {children}
    </div>
  );
}

function Platform() {
  return (
    <div className="absolute inset-x-2 bottom-2 h-[56px] rounded-[24px] bg-[#A5B696] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_8px_0_#889C79,0_20px_24px_-10px_rgba(43,33,24,0.32)]">
      <div className="absolute inset-x-3 top-2 h-8 rounded-[16px] bg-[#F2EBDC] shadow-[inset_0_2px_3px_rgba(43,33,24,0.1)]" />
    </div>
  );
}

function Siren({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <div className={`absolute ${className}`}>
      <motion.span
        className="gpu-layer absolute -inset-2 rounded-full bg-[#F28B4B]"
        animate={
          on
            ? { opacity: [0.12, 0.55, 0.12], scale: [0.92, 1.25, 0.92] }
            : { opacity: 0, scale: 1 }
        }
        transition={on ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
      />
      <div className="relative h-4 w-5 rounded-t-full bg-gradient-to-b from-[#FF9A5A] to-[#D9531F] shadow-[inset_0_2px_0_rgba(255,255,255,0.5)]" />
    </div>
  );
}

function Tag({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`absolute rounded-full bg-[#EFE3CC] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-soft ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene 1: Protect (120fps GPU glow ring instead of boxShadow)       */
/* ------------------------------------------------------------------ */

function SceneFreeze({ active, reduce }: { active: boolean; reduce: boolean }) {
  const [alarm, setAlarm] = useState(false);
  useEffect(() => {
    if (!active || reduce) {
      setAlarm(false);
      return;
    }
    setAlarm(true);
    const id = setInterval(() => setAlarm((a) => !a), 1900);
    return () => clearInterval(id);
  }, [active, reduce]);

  const wobble = alarm
    ? { rotate: [0, -6, 5, -3, 0], x: [0, 3, -2, 2, 0] }
    : { rotate: 0, x: 0 };

  return (
    <div className="relative h-full">
      <Platform />
      <Siren on={alarm} className="left-[14px] top-[26px]" />
      <AnimatePresence>
        {alarm && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="gpu-layer absolute left-[44px] top-[24px] rounded-full bg-brick px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ivory"
          >
            Breakdown alert
          </motion.span>
        )}
      </AnimatePresence>

      {/* Glass shield with pure GPU opacity glow ring */}
      <div className="absolute bottom-[34px] left-2 h-[92px] w-[116px] rounded-[22px] border border-white/85 bg-white/45 backdrop-blur-[2px]">
        <motion.div
          className="gpu-layer pointer-events-none absolute -inset-1 rounded-[25px] border-2 border-amber/70 bg-amber/10"
          animate={{ opacity: alarm ? 1 : 0, scale: alarm ? 1.02 : 0.98 }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {[14, 48, 82].map((l) => (
        <div key={l} className="absolute bottom-[44px]" style={{ left: l }}>
          <Clay tone="sage" className="h-12 w-7" />
        </div>
      ))}
      <svg
        className="absolute bottom-[56px] left-[40px] z-10"
        width="30"
        height="34"
        viewBox="0 0 30 34"
        aria-hidden="true"
      >
        <path
          d="M9 15V10a6 6 0 0 1 12 0v5"
          fill="none"
          stroke="#6B5A4A"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <rect
          x="4"
          y="14"
          width="22"
          height="17"
          rx="4.5"
          fill="#E9C777"
          stroke="#B88F2F"
          strokeWidth="1.4"
        />
        <circle cx="15" cy="21.5" r="2.4" fill="#6B5A4A" />
        <rect x="14" y="22" width="2" height="5" rx="1" fill="#6B5A4A" />
      </svg>
      <Tag className="bottom-[132px] left-[14px]">Locked · 60 min</Tag>

      {/* Two queued jobs outside the shield that are free to slide */}
      {[128, 160].map((l, i) => (
        <motion.div
          key={l}
          className="gpu-layer absolute bottom-[44px]"
          style={{ left: l }}
          animate={wobble}
          transition={{ duration: 0.8, delay: i * 0.08 }}
        >
          <Clay tone="sage" className="h-12 w-7" />
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene 2: Slide                                                     */
/* ------------------------------------------------------------------ */

function SceneRepair({ active, reduce }: { active: boolean; reduce: boolean }) {
  const loop = active && !reduce;
  return (
    <div className="relative h-full">
      <Platform />
      <Siren on={loop} className="bottom-[124px] left-[22px]" />
      <Clay tone="terra" className="absolute bottom-[40px] left-2 h-[84px] w-[48px]">
        <div className="mx-auto mt-3 grid h-7 w-8 place-items-center rounded-md bg-[#F6EBD3] font-mono text-[12px] font-medium text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,0.1)]">
          M3
        </div>
      </Clay>
      <div className="absolute bottom-[78px] left-[50px] h-2.5 w-[100px] origin-left rotate-[11deg] rounded-full bg-[#E5D9C1] shadow-[0_4px_5px_-3px_rgba(43,33,24,0.35)]" />

      {[62, 88, 114].map((l) => (
        <div key={l} className="absolute bottom-[44px]" style={{ left: l }}>
          <Clay tone="sage" className="h-10 w-[22px]" />
        </div>
      ))}
      <Tag className="bottom-[96px] left-[62px]">Stays put</Tag>

      {[142, 168].map((l, i) => (
        <motion.div
          key={l}
          className="gpu-layer absolute bottom-[44px]"
          style={{ left: l }}
          animate={
            loop
              ? {
                  x: [-90, -90, 0, 0, 0],
                  y: [-22, -22, 0, 0, 0],
                  opacity: [0, 1, 1, 1, 0],
                }
              : { x: 0, y: 0, opacity: 1 }
          }
          transition={
            loop
              ? {
                  duration: 3.8,
                  times: [0, 0.1, 0.5, 0.88, 1],
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        >
          <Clay tone="amber" className="h-10 w-[22px]" />
        </motion.div>
      ))}
      <Tag className="bottom-[96px] left-[146px] !bg-[#F7DEA6] !text-[#7a5410]">
        Slid
      </Tag>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene 3: Approve                                                   */
/* ------------------------------------------------------------------ */

function ScenePrice({ reduce }: { reduce: boolean }) {
  const [v, setV] = useState(50);
  const val = useMotionValue(50);
  const sv = useSpring(val, { stiffness: 160, damping: 20, mass: 0.4 });
  useEffect(() => {
    if (reduce) sv.jump(v);
    val.set(v);
  }, [v, reduce, val, sv]);

  const ang = useTransform(sv, (x) => ((x - 50) * 0.24 * Math.PI) / 180);
  const lx = useTransform(ang, (a) => 105 - 70 * Math.cos(a));
  const ly = useTransform(ang, (a) => 34 - 70 * Math.sin(a));
  const rx = useTransform(ang, (a) => 105 + 70 * Math.cos(a));
  const ry = useTransform(ang, (a) => 34 + 70 * Math.sin(a));

  const caption =
    v < 35
      ? "Calm floor: fewest jobs move, one delivery may slip."
      : v > 65
        ? "Deadline first: extra jobs move to hit every due date."
        : "Balanced: minimal moves, deliveries stay on track.";

  return (
    <div className="relative flex h-full flex-col">
      <svg
        viewBox="0 0 210 124"
        className="h-[96px] w-[176px] shrink-0"
        aria-hidden="true"
      >
        <ellipse cx="105" cy="116" rx="32" ry="6" fill="#C9BBA3" />
        <path
          d="M105 34 L105 112"
          stroke="#8C7A66"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <motion.line
          x1={lx}
          y1={ly}
          x2={rx}
          y2={ry}
          stroke="#8C7A66"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="105" cy="34" r="6" fill="#B5502B" />
        {[
          { x: lx, y: ly, tone: "#8FA77E", label: "L" },
          { x: rx, y: ry, tone: "#E4A93A", label: "R" },
        ].map((p) => (
          <motion.g
            key={p.label}
            style={{
              x: p.x as MotionValue<number>,
              y: p.y as MotionValue<number>,
            }}
          >
            <path
              d="M0 0 L-22 34 M0 0 L22 34"
              stroke="#8C7A66"
              strokeWidth="1.4"
            />
            <path
              d="M-26 34 Q0 58 26 34 Z"
              fill="#EADFC8"
              stroke="#B9A98F"
              strokeWidth="1.2"
            />
            <rect x="-9" y="20" width="18" height="14" rx="3.5" fill={p.tone} />
          </motion.g>
        ))}
      </svg>

      <div className="mt-1 flex w-[176px] flex-wrap gap-1.5">
        {["Due dates", "Setups", "Power tariff"].map((t, i) => (
          <motion.span
            key={t}
            className="gpu-layer rounded-full border border-[#D8C9AA] bg-[#F7EFD9] px-2.5 py-0.5 text-[10px] text-soft"
            animate={reduce ? undefined : { y: [0, -2, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          >
            {t}
          </motion.span>
        ))}
      </div>

      <label className="mt-3 block w-[176px]">
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          aria-label="Balance between fewer moves and earlier delivery"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-[#C8643B]"
        />
        <span className="mt-1.5 flex justify-between font-mono text-[10px] text-soft">
          <span>Fewer moves</span>
          <span>On-time first</span>
        </span>
      </label>
      <p
        className="mt-2 w-[176px] text-[11.5px] leading-snug text-ink"
        aria-live="polite"
      >
        {caption}
      </p>
      <span className="mt-auto mb-1 w-fit rounded-full bg-[#EFE3CC] px-3 py-1 font-mono text-[9.5px] uppercase tracking-wider text-soft">
        Waits for manager yes
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Guide Duck (Layered SVG)                                           */
/* ------------------------------------------------------------------ */

function Duck({
  pose,
  pupilX,
  pupilY,
  reduce,
}: {
  pose: Pose;
  pupilX: MotionValue<number>;
  pupilY: MotionValue<number>;
  reduce: boolean;
}) {
  return (
    <svg
      viewBox="0 0 140 150"
      width="104"
      height="112"
      aria-hidden="true"
      className="block overflow-visible"
    >
      <defs>
        <radialGradient id="dk-body" cx="36%" cy="28%" r="78%">
          <stop offset="0" stopColor="#FCE08A" />
          <stop offset="0.55" stopColor="#F4C447" />
          <stop offset="1" stopColor="#DC9A28" />
        </radialGradient>
        <radialGradient id="dk-hat" cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#EE9366" />
          <stop offset="1" stopColor="#B24E2A" />
        </radialGradient>
        <linearGradient id="dk-beak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7A152" />
          <stop offset="1" stopColor="#D8712A" />
        </linearGradient>
        <filter id="dk-soft" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="4"
            stdDeviation="3.2"
            floodColor="#5a3a12"
            floodOpacity="0.28"
          />
        </filter>
      </defs>

      <ellipse cx="68" cy="142" rx="36" ry="6" fill="#2B2118" opacity="0.16" />
      <g filter="url(#dk-soft)">
        <path
          d="M32 100 Q14 98 10 78 Q26 80 40 92 Z"
          fill="url(#dk-body)"
        />
        <ellipse cx="68" cy="100" rx="38" ry="32" fill="url(#dk-body)" />
        <ellipse
          cx="60"
          cy="108"
          rx="22"
          ry="15"
          fill="#FFF3C4"
          opacity="0.5"
        />
        <path
          d="M50 128 Q42 140 28 137 Q33 126 46 124 Z"
          fill="url(#dk-beak)"
        />
        <path
          d="M84 128 Q92 140 106 137 Q101 126 88 124 Z"
          fill="url(#dk-beak)"
        />
        <circle cx="84" cy="52" r="26" fill="url(#dk-body)" />
        <ellipse
          cx="96"
          cy="62"
          rx="5.5"
          ry="3.4"
          fill="#F08A5D"
          opacity="0.5"
        />
        <path
          d="M104 51 Q124 52 126 59 Q122 68 103 64 Z"
          fill="url(#dk-beak)"
        />
        <path
          d="M108 54 Q118 54 122 58"
          stroke="#FFD9AE"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
        <circle cx="91" cy="48" r="6.4" fill="#fff" />
        <motion.circle
          cx="92"
          cy="48"
          r="3.2"
          fill="#2B2118"
          style={{ x: pupilX, y: pupilY }}
        />
        <circle cx="93.4" cy="46.4" r="1" fill="#fff" />
        <path d="M60 40 A24 22 0 0 1 108 40 Z" fill="url(#dk-hat)" />
        <rect x="55" y="37" width="58" height="7.5" rx="3.75" fill="#A64B28" />
        <path
          d="M70 27 Q79 19 90 21"
          stroke="#FFD7BF"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
      </g>

      <AnimatePresence mode="wait">
        <motion.g
          key={pose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {pose === "wave" && (
            <motion.g
              style={{ originX: "96px", originY: "94px" }}
              animate={reduce ? undefined : { rotate: [0, -14, 6, -14, 0] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ellipse
                cx="108"
                cy="72"
                rx="9"
                ry="20"
                transform="rotate(-18 108 72)"
                fill="#E9AE35"
                stroke="#C98B1C"
                strokeWidth="1"
              />
              <circle
                cx="112"
                cy="50"
                r="9"
                fill="#F1BB48"
                stroke="#C98B1C"
                strokeWidth="1"
              />
              <path
                d="M108 44 v-6 M113 43 v-7 M118 45 v-6"
                stroke="#C98B1C"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </motion.g>
          )}
          {pose === "point" && (
            <g>
              <ellipse
                cx="108"
                cy="96"
                rx="20"
                ry="8.5"
                transform="rotate(-6 108 96)"
                fill="#E9AE35"
                stroke="#C98B1C"
                strokeWidth="1"
              />
              <circle
                cx="127"
                cy="94"
                r="6.5"
                fill="#F1BB48"
                stroke="#C98B1C"
                strokeWidth="1"
              />
            </g>
          )}
          {pose === "clip" && (
            <g>
              <rect
                x="88"
                y="80"
                width="34"
                height="42"
                rx="5"
                fill="#F7EDD6"
                stroke="#B89B6A"
                strokeWidth="1.4"
              />
              <rect x="97" y="75" width="16" height="9" rx="3" fill="#8C6B3F" />
              <path
                d="M94 94 h22 M94 102 h22 M94 110 h14"
                stroke="#C5B28A"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <ellipse
                cx="86"
                cy="102"
                rx="9"
                ry="16"
                transform="rotate(16 86 102)"
                fill="#E9AE35"
                stroke="#C98B1C"
                strokeWidth="1"
              />
            </g>
          )}
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */

export function Approach() {
  const reduce = !!useReducedMotion();
  const desktop = useDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const duckRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.35 });

  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  const facingRef = useRef<1 | -1>(1);
  const [auto, setAuto] = useState(true);
  const [walking, setWalking] = useState(false);
  const [quack, setQuack] = useState(false);

  // 120fps GPU X-Percent MotionValue for the guide duck (zero layout recalculations)
  const duckPct = useMotionValue(26.6);
  const smoothDuckPct = useSpring(duckPct, {
    stiffness: 90,
    damping: 19,
    mass: 0.8,
  });
  const duckTransform = useTransform(
    smoothDuckPct,
    (v) => `translate3d(${v.toFixed(2)}%, 0, 0)`
  );

  useEffect(() => {
    const targetPct = desktop ? step * 33.333 + 26.6 : 78;
    if (reduce) smoothDuckPct.jump(targetPct);
    duckPct.set(targetPct);
  }, [step, desktop, reduce, duckPct, smoothDuckPct]);

  const pick = useCallback((i: number, manual = true) => {
    if (i !== stepRef.current) {
      const f: 1 | -1 = i > stepRef.current ? 1 : -1;
      facingRef.current = f;
      setFacing(f);
      stepRef.current = i;
      setStep(i);
      setWalking(true);
    }
    if (manual) setAuto(false);
  }, []);

  useEffect(() => {
    if (!walking) return;
    const t = setTimeout(() => setWalking(false), reduce ? 0 : 900);
    return () => clearTimeout(t);
  }, [walking, reduce]);

  useEffect(() => {
    if (!inView || !auto || reduce) return;
    const t = setTimeout(() => {
      if (stepRef.current < 2) pick(stepRef.current + 1, false);
      else setAuto(false);
    }, 5400);
    return () => clearTimeout(t);
  }, [inView, auto, reduce, step, pick]);

  useEffect(() => {
    if (!quack) return;
    const t = setTimeout(() => setQuack(false), 2400);
    return () => clearTimeout(t);
  }, [quack]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 240, damping: 24 });
  const spy = useSpring(py, { stiffness: 240, damping: 24 });
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const el = duckRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx =
        e.clientX -
        (r.left + r.width * (facingRef.current === 1 ? 0.62 : 0.38));
      const dy = e.clientY - (r.top + r.height * 0.33);
      px.set(clamp(dx / 80, -1, 1) * 2.6 * facingRef.current);
      py.set(clamp(dy / 80, -1, 1) * 2.2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  const replay = () => {
    pick(0);
    setAuto(true);
  };

  const current = STEPS[step];

  return (
    <section id="approach" className="mx-auto max-w-6xl px-6 py-28">
      <div className="flex flex-col justify-between gap-6 border-b border-line pb-10 md:flex-row md:items-end">
        <div>
          <div className="mb-4 flex items-center gap-2.5 font-mono text-xs text-soft">
            <span className="text-terra">IV</span>
            <span>·</span>
            <span>How a repair works</span>
          </div>
          <h2 className="h-display max-w-2xl text-4xl text-ink sm:text-5xl">
            Fix the broken line. Leave the rest of the shop in peace.
          </h2>
        </div>
        <p className="max-w-md text-base leading-relaxed text-soft">
          Three simple rules keep operators calm when a breakdown, rush order,
          or late delivery hits the floor.
        </p>
      </div>

      {/* Minimalist Roman Numeral Switcher */}
      <div
        className="mt-8 flex flex-wrap items-center justify-between gap-3"
        role="tablist"
        aria-label="Repair rules"
      >
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const on = i === step;
            return (
              <button
                key={s.n}
                role="tab"
                aria-selected={on}
                onClick={() => pick(i)}
                className={`rounded-full px-4 py-2 text-xs transition-colors duration-300 ${
                  on
                    ? "bg-ink text-ivory"
                    : "border border-line bg-ivory/70 text-soft hover:text-ink"
                }`}
              >
                <span className="mr-2 font-mono text-[11px] text-terra">
                  {s.roman}
                </span>
                {s.short}
              </button>
            );
          })}
        </div>
        <button
          onClick={replay}
          className="rounded-full px-3 py-1.5 font-mono text-xs text-soft transition-colors hover:text-ink"
        >
          ↻ Replay sequence
        </button>
      </div>

      <div
        ref={rootRef}
        className="relative mt-6 rounded-[32px] border border-line bg-ivory shadow-card"
      >
        <div className="grid lg:grid-cols-3">
          {STEPS.map((s, i) => {
            const on = i === step;
            return (
              <div
                key={s.n}
                onClick={() => pick(i)}
                onPointerEnter={(e) => e.pointerType === "mouse" && pick(i)}
                className={`gpu-layer relative flex flex-col justify-between p-8 pb-10 transition-opacity duration-500 lg:border-l lg:border-line lg:first:border-l-0 ${
                  on ? "block opacity-100" : "hidden opacity-55 lg:flex"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-terra">
                      Rule {s.roman}
                    </span>
                    <span className="rounded-full border border-line bg-cream/70 px-2.5 py-0.5 font-mono text-[10px] text-soft">
                      {s.rule}
                    </span>
                  </div>

                  <h3 className="h-display mt-5 text-[28px] text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-soft">
                    {s.plain}
                  </p>
                </div>

                <div className="relative mt-8 h-[240px]">
                  {i === 0 && <SceneFreeze active={on} reduce={reduce} />}
                  {i === 1 && <SceneRepair active={on} reduce={reduce} />}
                  {i === 2 && <ScenePrice reduce={reduce} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* 120fps GPU-translated Guide Duck */}
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 overflow-visible">
          <motion.div className="gpu-layer w-full" style={{ transform: duckTransform }}>
            <div className="relative w-[104px] -translate-x-1/2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={quack ? "quack" : step}
                  initial={{ opacity: 0, scale: 0.88, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="gpu-layer absolute bottom-full right-[-6px] mb-1.5 w-[156px] origin-bottom-right rounded-2xl border border-[#D8C9AA] bg-[#F1E5CD] px-3.5 py-2 text-[12px] leading-snug text-ink shadow-card"
                >
                  {quack ? "Quack! Pick any rule to inspect." : current.bubble}
                  <span className="absolute -bottom-1.5 right-12 h-3 w-3 rotate-45 border-b border-r border-[#D8C9AA] bg-[#F1E5CD]" />
                </motion.div>
              </AnimatePresence>

              <button
                type="button"
                onClick={() => setQuack(true)}
                className="pointer-events-auto block cursor-pointer rounded-xl"
                aria-label="Guide duck. Press for a quack."
              >
                <motion.div
                  ref={duckRef}
                  className="gpu-layer"
                  style={{ scaleX: facing }}
                  animate={
                    reduce
                      ? undefined
                      : walking
                        ? {
                            rotate: [0, -5, 5, -5, 5, 0],
                            y: [0, -7, 0, -7, 0, 0],
                          }
                        : { y: [0, -3, 0] }
                  }
                  transition={
                    walking
                      ? { duration: 0.85 }
                      : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                  }
                >
                  <Duck
                    pose={current.pose}
                    pupilX={spx}
                    pupilY={spy}
                    reduce={reduce}
                  />
                </motion.div>
              </button>
            </div>
          </motion.div>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          Rule {current.roman}: {current.title}. {current.bubble}
        </p>
      </div>
    </section>
  );
}