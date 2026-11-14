import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Costume, Mood } from "./types";

/* DuckMama: a chubby clay duckling. Big round head, tiny beak, glossy eyes, small body.
   viewBox 120 x 132. Everything that changes with mood is a row in POSES. */

interface Pose {
  brows: [string, string];
  lids: [number, number];
  eye: [number, number]; // rx, ry of the dark eye
  shock: boolean; // white of the eye shows (panic)
  wings: [number, number];
  head: number;
  mouth: number;
  arcs?: boolean;
  blush: number;
}
const B = (l: string, r: string): [string, string] => [l, r];
const POSES: Record<Mood, Pose> = {
  calm: { brows: B("M39 40 Q46 37 53 40", "M67 40 Q74 37 81 40"), lids: [0, 0], eye: [7.4, 9], shock: false, wings: [8, -8], head: 0, mouth: 0, blush: 0.5 },
  panic: { brows: B("M38 33 Q46 28 54 37", "M66 37 Q74 28 82 33"), lids: [0, 0], eye: [3.2, 3.8], shock: true, wings: [125, -125], head: 0, mouth: 0.55, blush: 0.2 },
  surgical: { brows: B("M39 43 Q46 41 53 45", "M67 36 Q74 33 81 36"), lids: [0.52, 0], eye: [7, 8.4], shock: false, wings: [14, -26], head: 4, mouth: 0, blush: 0.4 },
  smug: { brows: B("M39 43 Q46 42 53 44", "M67 34 Q74 30 81 35"), lids: [0.4, 0.4], eye: [7.4, 9], shock: false, wings: [8, 130], head: -5, mouth: 0, blush: 0.6 },
  listening: { brows: B("M39 37 Q46 34 53 37", "M67 37 Q74 34 81 37"), lids: [0, 0], eye: [7.8, 9.4], shock: false, wings: [20, -30], head: 5, mouth: 0, blush: 0.5 },
  laughing: { brows: B("M39 37 Q46 33 53 37", "M67 37 Q74 33 81 37"), lids: [0, 0], eye: [7.4, 9], shock: false, wings: [40, -40], head: -3, mouth: 1, arcs: true, blush: 0.75 },
  sleepy: { brows: B("M39 42 Q46 43 53 42", "M67 42 Q74 43 81 42"), lids: [0.82, 0.82], eye: [7.4, 9], shock: false, wings: [6, -6], head: 8, mouth: 0.1, blush: 0.4 },
  approved: { brows: B("M39 39 Q46 35 53 39", "M67 39 Q74 35 81 39"), lids: [0.14, 0.14], eye: [7.6, 9], shock: false, wings: [8, -34], head: 0, mouth: 0.25, blush: 0.8 },
  empathetic: { brows: B("M39 42 Q46 38 53 35", "M67 35 Q74 38 81 42"), lids: [0.08, 0.08], eye: [8.2, 9.8], shock: false, wings: [8, 85], head: -7, mouth: 0, blush: 0.55 },
};

function Pivot({ cx, cy, deg, children, stiffness = 170, damping = 15 }: { cx: number; cy: number; deg: number; children: ReactNode; stiffness?: number; damping?: number }) {
  const ref = useRef<SVGGElement>(null);
  const reduce = useReducedMotion();
  const mv = useMotionValue(deg);
  const apply = (v: number) => ref.current?.setAttribute("transform", `rotate(${v.toFixed(2)} ${cx} ${cy})`);
  useLayoutEffect(() => apply(mv.get()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reduce) {
      mv.set(deg);
      return;
    }
    const c = animate(mv, deg, { type: "spring", stiffness, damping });
    return () => c.stop();
  }, [deg, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  useMotionValueEvent(mv, "change", apply);
  return <g ref={ref}>{children}</g>;
}

function Defs() {
  return (
    <defs>
      <radialGradient id="d2-body" cx="38%" cy="24%" r="85%">
        <stop offset="0" stopColor="#FFEFA6" />
        <stop offset="0.38" stopColor="#FFD84F" />
        <stop offset="0.8" stopColor="#F2AE2E" />
        <stop offset="1" stopColor="#D98E22" />
      </radialGradient>
      <radialGradient id="d2-belly" cx="50%" cy="30%" r="75%">
        <stop offset="0" stopColor="#FFFBE2" />
        <stop offset="1" stopColor="#FFE693" />
      </radialGradient>
      <linearGradient id="d2-beak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFB45E" />
        <stop offset="1" stopColor="#EC7F2B" />
      </linearGradient>
      <radialGradient id="d2-eye" cx="40%" cy="35%" r="75%">
        <stop offset="0" stopColor="#6B4A33" />
        <stop offset="0.45" stopColor="#2F1D12" />
        <stop offset="1" stopColor="#170D07" />
      </radialGradient>
      <radialGradient id="d2-cheek" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#FF7E6B" stopOpacity="0.85" />
        <stop offset="1" stopColor="#FF7E6B" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="d2-hat" cx="35%" cy="20%" r="90%">
        <stop offset="0" stopColor="#F6A27A" />
        <stop offset="1" stopColor="#B9532D" />
      </radialGradient>
      <radialGradient id="d2-red" cx="35%" cy="20%" r="90%">
        <stop offset="0" stopColor="#F58475" />
        <stop offset="1" stopColor="#B02B22" />
      </radialGradient>
      <linearGradient id="d2-brass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F6DC96" />
        <stop offset="0.5" stopColor="#CFA040" />
        <stop offset="1" stopColor="#8E6620" />
      </linearGradient>
      <linearGradient id="d2-steel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#E3E7E9" />
        <stop offset="1" stopColor="#7C868B" />
      </linearGradient>
      <linearGradient id="d2-ped" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F0E2C8" />
        <stop offset="1" stopColor="#C8AE86" />
      </linearGradient>
      <radialGradient id="d2-velvet" cx="40%" cy="20%" r="90%">
        <stop offset="0" stopColor="#BC3E52" />
        <stop offset="1" stopColor="#5E1426" />
      </radialGradient>
      <linearGradient id="d2-hood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#53402F" />
        <stop offset="1" stopColor="#2A1D14" />
      </linearGradient>
      <linearGradient id="d2-lens" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#55555C" />
        <stop offset="1" stopColor="#0E0E12" />
      </linearGradient>
      {/* clay: soft lumpy edge plus fingertip grain */}
      <filter id="d2-clay" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="5" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="lumpy" />
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="11" result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.28  0 0 0 0 0.05  0 0 0 0.16 -0.015" result="g" />
        <feComposite in="g" in2="lumpy" operator="in" result="gin" />
        <feMerge>
          <feMergeNode in="lumpy" />
          <feMergeNode in="gin" />
        </feMerge>
      </filter>
      <filter id="d2-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
      <clipPath id="d2-eye-l">
        <ellipse cx="46" cy="52" rx="9" ry="10.5" />
      </clipPath>
      <clipPath id="d2-eye-r">
        <ellipse cx="74" cy="52" rx="9" ry="10.5" />
      </clipPath>
    </defs>
  );
}

/* ---- costumes: sized for the chubby head */
function Hat({ red }: { red?: boolean }) {
  return (
    <g filter="url(#d2-clay)">
      <path d="M31 33 Q32 8 60 8 Q88 8 89 33 Z" fill={red ? "url(#d2-red)" : "url(#d2-hat)"} />
      <path d="M55 8.6 Q60 6 65 8.6 L65 32 L55 32 Z" fill="#fff" opacity="0.16" />
      <rect x="25" y="29.5" width="70" height="7" rx="3.5" fill={red ? "#82201A" : "#A44B28"} />
      <path d="M40 17 Q46 11 55 11.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.55" />
    </g>
  );
}
const Tuft = () => <path d="M60 17 Q52 7 57 2 Q60 8 62 12 Q64 4 71 5 Q68 11 65 17 Z" fill="url(#d2-body)" filter="url(#d2-clay)" />;

function Gear({ costume, reduce }: { costume: Costume; reduce: boolean }) {
  switch (costume) {
    case "foreman":
      return <Hat />;
    case "medic":
      return (
        <g>
          <Hat red />
          <g filter="url(#d2-clay)">
            <rect x="52" y="1" width="16" height="6" rx="2" fill="#7E1D16" />
            <path d="M52 2 Q60 -10 68 2 Z" fill="url(#d2-red)" />
          </g>
          <motion.circle cx="60" cy="-3" r="13" fill="#FF5A4A" initial={{ opacity: 0.1 }} animate={reduce ? { opacity: 0.25 } : { opacity: [0.08, 0.5, 0.08] }} transition={{ duration: 0.8, repeat: Infinity }} />
          <rect x="34" y="23" width="52" height="5" rx="2.5" fill="#3A2A1E" />
          {[47, 73].map((x) => (
            <g key={x}>
              <circle cx={x} cy="25.5" r="7.4" fill="#CFA040" />
              <circle cx={x} cy="25.5" r="5.3" fill="url(#d2-lens)" />
              <path d={`M${x - 3} 23 Q${x} 20.8 ${x + 2} 22.4`} stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.7" />
            </g>
          ))}
        </g>
      );
    case "hacker":
      return (
        <g>
          <path d="M26 56 Q22 8 60 8 Q98 8 94 56" stroke="#E0A33A" strokeWidth="4.6" fill="none" strokeLinecap="round" />
          <rect x="20" y="48" width="9" height="18" rx="4" fill="#E0A33A" />
          <rect x="91" y="48" width="9" height="18" rx="4" fill="#E0A33A" />
          <path d="M24 66 Q27 80 46 80" stroke="#B9822A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <motion.circle cx="47" cy="80" r="3.2" fill="#FFC857" animate={reduce ? { opacity: 1 } : { opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }} />
        </g>
      );
    case "boss":
      return (
        <g>
          <Tuft />
          <path d="M22 52 L34 52 M86 52 L98 52" stroke="#CFA040" strokeWidth="2.4" strokeLinecap="round" />
          {[46, 74].map((x) => (
            <g key={x}>
              <path d={`M${x - 13} 44 Q${x} 41 ${x + 13} 44 Q${x + 13} 63 ${x} 64 Q${x - 13} 63 ${x - 13} 44 Z`} fill="url(#d2-lens)" stroke="#CFA040" strokeWidth="2.2" />
              <path d={`M${x - 8} 48 Q${x - 3} 46 ${x} 47`} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55" />
            </g>
          ))}
          <path d="M59 47 Q60 45 61 47" stroke="#CFA040" strokeWidth="2.4" fill="none" />
        </g>
      );
    case "inspector":
      return (
        <g>
          <Tuft />
          <circle cx="74" cy="52" r="12.5" fill="#BFE3F0" opacity="0.2" />
          <circle cx="74" cy="52" r="12.5" fill="none" stroke="url(#d2-brass)" strokeWidth="3" />
          <path d="M83 61 Q96 78 92 96" stroke="#CFA040" strokeWidth="1.7" fill="none" strokeDasharray="2.4 2" />
          <path d="M67 46 Q70 43 75 44" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85" />
        </g>
      );
    case "vip":
      return (
        <g filter="url(#d2-clay)">
          <path d="M36 30 L39 6 L50 19 L60 2 L70 19 L81 6 L84 30 Z" fill="url(#d2-brass)" stroke="#8E6620" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="36" y="26" width="48" height="7" rx="3" fill="#CFA040" />
          <circle cx="60" cy="29.5" r="2.8" fill="#C8643B" />
          <circle cx="47" cy="29.5" r="2" fill="#7A8F6B" />
          <circle cx="73" cy="29.5" r="2" fill="#7A8F6B" />
        </g>
      );
  }
}

function Back({ costume }: { costume: Costume }) {
  if (costume === "vip")
    return (
      <g filter="url(#d2-clay)">
        <path d="M30 82 Q14 106 22 120 L98 120 Q106 106 90 82 Q60 94 30 82 Z" fill="url(#d2-velvet)" />
      </g>
    );
  if (costume === "hacker")
    return (
      <g filter="url(#d2-clay)">
        <path d="M22 52 Q20 8 60 6 Q100 8 98 52 Q100 82 84 86 L36 86 Q20 82 22 52 Z" fill="url(#d2-hood)" />
      </g>
    );
  return null;
}

function Front({ costume }: { costume: Costume }) {
  if (costume === "vip")
    return (
      <g>
        <ellipse cx="60" cy="84" rx="28" ry="6.5" fill="#FFFBF3" />
        {[42, 50, 58, 66, 74, 82].map((x, i) => (
          <circle key={x} cx={x} cy={84 + (i % 2 ? 1.6 : -0.8)} r="1.2" fill="#262616" />
        ))}
      </g>
    );
  if (costume === "hacker")
    return (
      <g filter="url(#d2-clay)">
        <path d="M32 92 Q60 116 88 92 Q92 114 60 120 Q28 114 32 92 Z" fill="url(#d2-hood)" />
        <path d="M60 88 L60 118" stroke="#E0A33A" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  if (costume === "boss") return <path d="M44 84 Q60 94 76 84" stroke="#CFA040" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  return null;
}

function Prop({ kind, reduce, tick }: { kind: string; reduce: boolean; tick: number }) {
  switch (kind) {
    case "caliper":
      return (
        <g>
          <rect x="-2" y="-18" width="4" height="38" rx="1.4" fill="url(#d2-brass)" />
          <rect x="-2" y="-18" width="10" height="4" rx="1.2" fill="url(#d2-brass)" />
          <rect x="-2" y="5" width="10" height="4" rx="1.2" fill="url(#d2-brass)" />
          <circle cx="0" cy="-3" r="3.4" fill="#FFFBF3" stroke="#8E6620" strokeWidth="1.1" />
        </g>
      );
    case "wrench":
      return (
        <g transform="rotate(-22)">
          <rect x="-3" y="-5" width="6" height="32" rx="3" fill="url(#d2-steel)" />
          <path d="M-8 -5 Q-8 -17 0 -17 Q8 -17 8 -5 L3 -5 L3 -10 L-3 -10 L-3 -5 Z" fill="url(#d2-steel)" />
        </g>
      );
    case "clipboard":
      return (
        <g>
          <rect x="-12" y="-16" width="25" height="32" rx="3" fill="#8B5E3C" />
          <rect x="-9.5" y="-11" width="19" height="24" rx="1.4" fill="#FFFBF3" />
          <rect x="-4" y="-19" width="8" height="5" rx="1.6" fill="url(#d2-brass)" />
          {[-6, -1, 4, 9].map((y) => (
            <path key={y} d={`M-6.5 ${y} L${y === 9 ? 1 : 6.5} ${y}`} stroke="#C9B79A" strokeWidth="1.2" strokeLinecap="round" />
          ))}
          <motion.g animate={reduce ? undefined : { x: [0, -2.5, 1.6, -1.6, 0], y: [0, 1.2, -0.8, 0.8, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
            <path d="M6 3 L15 -10" stroke="#E0A33A" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M5.4 5 L6 3" stroke="#262616" strokeWidth="2.6" strokeLinecap="round" />
          </motion.g>
        </g>
      );
    case "stamp":
      return (
        <motion.g key={tick} initial={{ y: -14 }} animate={{ y: [-14, 11, 0] }} transition={{ duration: 0.55, times: [0, 0.55, 1], ease: "easeOut" }}>
          <rect x="-4" y="-20" width="8" height="13" rx="4" fill="#7A8F6B" />
          <rect x="-10" y="-8" width="20" height="8" rx="2.6" fill="#5F7552" />
          <rect x="-11" y="0" width="22" height="3.4" rx="1.4" fill="#3E5234" />
        </motion.g>
      );
    case "chai":
      return (
        <g>
          <path d="M-8 -9 L8 -9 L5.6 10 L-5.6 10 Z" fill="#E8A94A" fillOpacity="0.92" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
          <path d="M-6 -3 L6 -3 L5 4 L-5 4 Z" fill="#B76F22" opacity="0.5" />
          <ellipse cx="0" cy="12" rx="10.5" ry="2.8" fill="#CFA040" />
          {[-3, 3].map((x, i) => (
            <motion.path key={x} d={`M${x} -11 q-2.6 -4 0 -8 q2.6 -4 0 -8`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" initial={{ opacity: 0.2 }} animate={reduce ? { opacity: 0.4 } : { opacity: [0, 0.7, 0], y: [2, -5, -9] }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.9 }} />
          ))}
        </g>
      );
    case "scroll":
      return (
        <g transform="rotate(-12)">
          <rect x="-11" y="-8" width="22" height="16" rx="3.6" fill="#FFFBF3" stroke="#C9B79A" strokeWidth="1.1" />
          <ellipse cx="-11" cy="0" rx="2.6" ry="8" fill="#F0E3C8" stroke="#C9B79A" strokeWidth="1.1" />
          <rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1.8" fill="#217346" />
          <path d="M-2 -2 L2 2 M2 -2 L-2 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case "gavel":
      return (
        <g transform="rotate(-30)">
          <rect x="-2" y="-7" width="4" height="29" rx="2" fill="#8B5E3C" />
          <rect x="-9.5" y="-14" width="19" height="9.5" rx="3" fill="url(#d2-brass)" />
        </g>
      );
    default:
      return null;
  }
}
const COSTUME_PROP: Record<Costume, string> = { foreman: "caliper", medic: "wrench", hacker: "", boss: "chai", inspector: "scroll", vip: "gavel" };

export interface DuckProps {
  mood: Mood;
  costume: Costume;
  talking?: boolean;
  thinking?: boolean;
  look: { x: MotionValue<number>; y: MotionValue<number> };
  stampTick?: number;
  className?: string;
}

export function Duck({ mood, costume, talking = false, thinking = false, look, stampTick = 0, className }: DuckProps) {
  const reduce = !!useReducedMotion();
  const pose = POSES[mood];
  const [blink, setBlink] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (reduce || pose.arcs) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), mood === "sleepy" ? 420 : 130);
        loop();
      }, 2800 + Math.random() * 2600);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [mood, reduce, pose.arcs]);

  useEffect(() => {
    if (!(talking || mood === "laughing") || reduce) {
      setPulse(0);
      return;
    }
    const id = window.setInterval(() => setPulse(Math.random() > 0.35 ? 0.35 + Math.random() * 0.65 : 0.05), mood === "laughing" ? 150 : 120);
    return () => window.clearInterval(id);
  }, [talking, mood, reduce]);

  const open = Math.max(pose.mouth * (mood === "laughing" ? 0.45 + 0.55 * pulse : 1), talking ? pulse * 0.8 : 0);
  const lids: [number, number] = blink ? [1, 1] : pose.lids;
  const [erx, ery] = pose.eye;
  const prop = mood === "surgical" ? "wrench" : mood === "listening" ? "clipboard" : mood === "approved" ? "stamp" : COSTUME_PROP[costume];
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const fixed = thinking ? { x: -2, y: -2.4 } : mood === "listening" ? { x: -1.8, y: 2.2 } : null;
  useMotionValueEvent(look.x, "change", (v) => !fixed && px.set(v * 0.62));
  useMotionValueEvent(look.y, "change", (v) => !fixed && py.set(v * 0.62));
  useEffect(() => {
    if (fixed) {
      animate(px, fixed.x, { type: "spring", stiffness: 200, damping: 20 });
      animate(py, fixed.y, { type: "spring", stiffness: 200, damping: 20 });
    } else {
      px.set(look.x.get() * 0.62);
      py.set(look.y.get() * 0.62);
    }
  }, [thinking, mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const shades = costume === "boss";
  const shake = mood === "panic" && !reduce;
  const handTop = mood === "smug"; // chef's kiss: the wing is busy at the beak

  return (
    <motion.svg
      viewBox="0 0 120 132"
      className={className}
      role="img"
      aria-label={`DuckMama, feeling ${mood}`}
      animate={shake ? { x: [-1.2, 1.2, -1.2] } : { x: 0 }}
      transition={shake ? { duration: 0.22, repeat: Infinity } : { duration: 0.2 }}
      style={{ overflow: "visible" }}
    >
      <Defs />
      <ellipse cx="60" cy="125" rx="40" ry="5.5" fill="#2B2118" opacity="0.15" />
      <g filter="url(#d2-clay)">
        <ellipse cx="60" cy="119.5" rx="38" ry="8.5" fill="url(#d2-ped)" />
        <ellipse cx="60" cy="117" rx="35" ry="6.4" fill="#F4E8D0" />
      </g>

      <motion.g animate={reduce ? undefined : { y: [0, -1.1, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
        <Back costume={costume} />
        {/* feet */}
        <g filter="url(#d2-clay)">
          <ellipse cx="47" cy="114.5" rx="9.5" ry="4" fill="url(#d2-beak)" />
          <ellipse cx="73" cy="114.5" rx="9.5" ry="4" fill="url(#d2-beak)" />
        </g>
        {/* body: a plump egg */}
        <g filter="url(#d2-clay)">
          <path d="M60 64 C84 64 94 82 92 98 C90 112 76 116 60 116 C44 116 30 112 28 98 C26 82 36 64 60 64 Z" fill="url(#d2-body)" />
          <ellipse cx="60" cy="98" rx="19" ry="15" fill="url(#d2-belly)" opacity="0.92" />
          <path d="M88 100 Q100 96 100 88 Q96 97 86 99 Z" fill="url(#d2-body)" />
        </g>
        <Front costume={costume} />
        <g stroke="#B8801F" strokeWidth="0.8" fill="none" opacity="0.2" strokeLinecap="round">
          <path d="M38 100 q3 -4 7 -2 M39 104 q3 -5 8 -2" />
          <path d="M76 98 q3 -4 7 -2 M77 103 q3 -5 7 -2" />
        </g>

        {/* wings */}
        <g transform="translate(33 86)">
          <Pivot cx={0} cy={0} deg={pose.wings[0]}>
            <path d="M0 0 C-9 2 -12 15 -7 25 C2 23 8 12 6 2 Z" fill="url(#d2-body)" filter="url(#d2-clay)" />
          </Pivot>
        </g>
        <g transform="translate(87 86)">
          <Pivot cx={0} cy={0} deg={pose.wings[1]}>
            <path d="M0 0 C9 2 12 15 7 25 C-2 23 -8 12 -6 2 Z" fill="url(#d2-body)" filter="url(#d2-clay)" />
          </Pivot>
        </g>

        {/* head */}
        <Pivot cx={60} cy={84} deg={pose.head} stiffness={140} damping={13}>
          <g filter="url(#d2-clay)">
            <circle cx="60" cy="50" r="37" fill="url(#d2-body)" />
          </g>
          {/* soft light: matte highlight, rim and a little shade under the chin */}
          <ellipse cx="42" cy="26" rx="14" ry="7" fill="#fff" opacity="0.28" transform="rotate(-28 42 26)" filter="url(#d2-soft)" />
          <ellipse cx="40" cy="25" rx="5.5" ry="2.6" fill="#fff" opacity="0.5" transform="rotate(-28 40 25)" />
          <path d="M96 46 Q94 70 70 86" stroke="#C98A1E" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.18" filter="url(#d2-soft)" />

          {/* blush */}
          <motion.ellipse cx="33" cy="64" rx="8" ry="5.4" fill="url(#d2-cheek)" initial={false} animate={{ opacity: pose.blush }} />
          <motion.ellipse cx="87" cy="64" rx="8" ry="5.4" fill="url(#d2-cheek)" initial={false} animate={{ opacity: pose.blush }} />

          {/* eyes: big, glossy, a little wet */}
          {([46, 74] as const).map((cx, i) => (
            <g key={cx}>
              <g clipPath={`url(#d2-eye-${i ? "r" : "l"})`}>
                <motion.ellipse cx={cx} cy="52" fill="#fff" initial={false} animate={{ rx: pose.shock ? 9 : 0, ry: pose.shock ? 10.5 : 0, opacity: pose.shock ? 1 : 0 }} transition={{ duration: 0.2 }} />
                {!pose.arcs && (
                  <motion.g style={{ x: px, y: py }}>
                    <motion.ellipse cx={cx} cy="52.4" fill="url(#d2-eye)" initial={false} animate={{ rx: erx, ry: ery }} transition={{ duration: 0.22 }} />
                    {!pose.shock && (
                      <>
                        <circle cx={cx + 2.6} cy="48" r="3.1" fill="#fff" />
                        <circle cx={cx - 2.6} cy="56.6" r="1.4" fill="#fff" opacity="0.85" />
                      </>
                    )}
                  </motion.g>
                )}
                <motion.rect x={cx - 11} y={52 - 12.5 - 26} width="22" height="26" fill="#FFD04A" initial={false} animate={{ y: lids[i] * 27 }} transition={{ duration: blink ? 0.07 : 0.3 }} />
              </g>
              {pose.arcs && <path d={`M${cx - 7} 55 Q${cx} 44 ${cx + 7} 55`} stroke="#2F1D12" strokeWidth="3.2" strokeLinecap="round" fill="none" />}
              {/* lashes: she's Mama */}
              <path d={i ? "M82 47 l4 -2.4 M83 52 l4.6 -0.6" : "M38 47 l-4 -2.4 M37 52 l-4.6 -0.6"} stroke="#2F1D12" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          ))}
          {!shades && (
            <>
              <motion.path d={pose.brows[0]} stroke="#8A5A2B" strokeWidth="2.6" strokeLinecap="round" fill="none" initial={false} animate={{ d: pose.brows[0] }} transition={{ duration: 0.28 }} />
              <motion.path d={pose.brows[1]} stroke="#8A5A2B" strokeWidth="2.6" strokeLinecap="round" fill="none" initial={false} animate={{ d: pose.brows[1] }} transition={{ duration: 0.28 }} />
            </>
          )}

          {/* beak: a flat, wide duck bill with a seam, always a little smile */}
          <g filter="url(#d2-clay)">
            <motion.ellipse cx="60" fill="#6B2A16" initial={false} animate={{ cy: 67 + open * 2, rx: 8 * Math.min(1, open * 2.2), ry: open * 5 }} transition={{ duration: 0.1 }} />
            <motion.path fill="url(#d2-beak)" initial={false} animate={{ d: `M49 ${66.4 + open * 1.5} Q60 ${64 + open * 5.5} 71 ${66.4 + open * 1.5} Q70 ${72 + open * 6.5} 60 ${72.6 + open * 7} Q50 ${72 + open * 6.5} 49 ${66.4 + open * 1.5} Z` }} transition={{ duration: 0.1 }} />
            <path d="M44 61 Q60 53 76 61 Q80 66.4 60 67.6 Q40 66.4 44 61 Z" fill="url(#d2-beak)" />
            <path d="M50 58.6 Q60 55 70 58.6" stroke="#FFE2BF" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
          </g>
          <path d="M48 66.2 Q60 68.6 72 66.2" stroke="#B85A1F" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55" />
          <path d="M55.4 61 l1.8 0.6 M64.6 61 l-1.8 0.6" stroke="#9A4519" strokeWidth="1" strokeLinecap="round" opacity="0.55" />

          <Gear costume={costume} reduce={reduce} />
        </Pivot>

        {/* mood extras */}
        {mood === "panic" && (
          <motion.path d="M99 34 q-3.4 6 0 9 q3.4 -3.4 0 -9 z" fill="#7BC8F0" stroke="#fff" strokeWidth="0.7" animate={reduce ? undefined : { y: [0, 18], opacity: [1, 0] }} transition={{ duration: 0.9, repeat: Infinity }} />
        )}
        {mood === "sleepy" &&
          [0, 1, 2].map((i) => (
            <motion.text key={i} x={92 + i * 6} y={28 - i * 8} fontSize={9 + i * 2.6} fontWeight="700" fill="#6B5A4A" fontFamily="Fraunces, Georgia, serif" initial={{ opacity: 0 }} animate={reduce ? { opacity: 0.8 } : { opacity: [0, 0.9, 0], y: [0, -9] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.7 }}>
              z
            </motion.text>
          ))}
        {mood === "smug" && (
          <motion.path d="M100 44 l2 4.8 l4.8 2 l-4.8 2 l-2 4.8 l-2 -4.8 l-4.8 -2 l4.8 -2 z" fill="#FFC857" initial={{ scale: 0.6, opacity: 0.6 }} animate={reduce ? undefined : { scale: [0.6, 1.1, 0.6], opacity: [0.5, 1, 0.5] }} style={{ transformBox: "fill-box", transformOrigin: "center" }} transition={{ duration: 1.4, repeat: Infinity }} />
        )}
        {mood === "approved" && (
          <motion.g key={stampTick} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 1, 1] }} transition={{ duration: 2.4, times: [0, 0.2, 0.7, 1], delay: 0.45 }} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <circle cx="20" cy="112" r="10" fill="none" stroke="#7A8F6B" strokeWidth="3" />
            <path d="M14.5 112 l4 4 l7 -8.6" stroke="#7A8F6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </motion.g>
        )}

        {prop && !handTop && (
          <g transform="translate(101 104) scale(0.82)">
            <motion.g key={prop} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
              <Prop kind={prop} reduce={reduce} tick={stampTick} />
            </motion.g>
          </g>
        )}
      </motion.g>
    </motion.svg>
  );
}
