import { motion, useMotionTemplate, useTransform } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { AXIS, MACHINES } from "../lib/schedule";
import type { Placed, Win } from "../lib/schedule";

function Block({
  p,
  progress,
  variant,
}: {
  p: Placed;
  progress: MotionValue<number>;
  variant: "light" | "dark";
}) {
  // Pure GPU translation: percentage is relative to block's own width (p.dur)
  const xPct = useTransform(progress, [0, 1], [(p.from / p.dur) * 100, (p.to / p.dur) * 100]);
  const transform = useMotionTemplate`translate3d(${xPct}%, 0, 0)`;

  const movedOpacity = useTransform(progress, [0, 0.15, 1], [0, p.moved || p.added ? 0.35 : 0, p.moved || p.added ? 1 : 0]);
  const blockOpacity = useTransform(progress, [0, 0.3, 1], [p.added ? 0 : 1, 1, 1]);

  const isDark = variant === "dark";

  return (
    <motion.div
      className="gpu-layer absolute top-0 left-0 flex h-full items-center justify-center overflow-hidden rounded-[6px] font-mono text-[11px]"
      style={{
        width: `${(p.dur / AXIS) * 100}%`,
        transform,
        opacity: blockOpacity,
      }}
    >
      {/* Base untouched layer */}
      <span
        className={`absolute inset-0 rounded-[6px] border transition-none ${
          isDark
            ? "border-[#4A5D43]/70 bg-[#293526]/90 text-[#D4E2CE]"
            : "border-[#7A8F6B]/80 bg-[#E4EBDD] text-[#2B2118]"
        }`}
      />
      {/* Pre-composited moved layer (fades in purely via GPU opacity) */}
      {(p.moved || p.added) && (
        <motion.span
          className={`absolute inset-0 rounded-[6px] border ${
            isDark
              ? "border-[#E0A33A] bg-[#4A3219] shadow-[0_0_16px_rgba(224,163,58,0.22)]"
              : "border-[#C8643B] bg-[#F8DDB0]"
          }`}
          style={{ opacity: movedOpacity }}
        />
      )}
      <span className={`relative z-10 font-medium ${isDark ? "text-[#FAF3E8]" : "text-ink"}`}>
        {p.job}
      </span>
    </motion.div>
  );
}

export function Gantt({
  placed,
  progress,
  windows = [],
  windowOpacity = 1,
  rowH = 26,
  variant = "light",
}: {
  placed: Placed[];
  progress: MotionValue<number>;
  windows?: Win[];
  windowOpacity?: MotionValue<number> | number;
  rowH?: number;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <div className="w-full select-none">
      <div className="flex flex-col gap-1.5">
        {MACHINES.map((name, m) => (
          <div key={name} className="flex items-center gap-2.5">
            <span
              className={`w-7 shrink-0 font-mono text-[11px] ${
                isDark ? "text-[#A39382]" : "text-soft"
              }`}
            >
              {name}
            </span>
            <div
              className={`relative flex-1 overflow-hidden rounded-[6px] ${
                isDark ? "bg-white/[0.04]" : "bg-ink/[0.035]"
              }`}
              style={{ height: rowH }}
            >
              {windows
                .filter((w) => w.machine === m)
                .map((w) => (
                  <motion.div
                    key={w.label}
                    className={`gpu-layer absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-[6px] border text-[10px] font-medium ${
                      w.kind === "down"
                        ? isDark
                          ? "hatch-dark border-[#EF6B5E]/60 text-[#FFDAD6]"
                          : "hatch border-brick/60 text-brick"
                        : "hatch-amber border-amber/70 text-[#8a5a10]"
                    }`}
                    style={{
                      left: `${(w.from / AXIS) * 100}%`,
                      width: `${((w.to - w.from) / AXIS) * 100}%`,
                      opacity: windowOpacity,
                    }}
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${
                        isDark ? "bg-[#201813]/90 text-[#FFACA3]" : "bg-ivory/85 text-brick"
                      }`}
                    >
                      {w.label}
                    </span>
                  </motion.div>
                ))}
              {placed
                .filter((p) => p.machine === m)
                .map((p) => (
                  <Block key={p.id} p={p} progress={progress} variant={variant} />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="relative mt-2 ml-9 h-4">
        {[0, 5, 10, 15, 20].map((t) => (
          <span
            key={t}
            className={`absolute -translate-x-1/2 font-mono text-[10px] ${
              isDark ? "text-[#8E7E6E]" : "text-soft/80"
            }`}
            style={{ left: `${(t / AXIS) * 100}%` }}
          >
            {t}h
          </span>
        ))}
      </div>
    </div>
  );
}