import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { Reveal } from "./Reveal";

const csv = `job_id,op_seq,eligible_machines,duration_min,due_at,priority
J-014,1,M2|M4,95,2026-11-12T16:00,2
J-014,2,M1,60,2026-11-12T16:00,2
J-021,1,M3,120,2026-11-13T10:00,1`;

export function Fit() {
  const [choice, setChoice] = useState<"approve" | "reject" | "again" | null>(
    null
  );
  const label = {
    approve: "Approved. Work instructions go out.",
    reject: "Rejected. The original plan stays.",
    again: "Asking for another plan…",
  };

  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    mass: 0.2,
  });

  // Opposing 120fps GPU card parallax
  const leftCardY = useTransform(smooth, [0.1, 0.55], [44, 0]);
  const rightCardY = useTransform(smooth, [0.15, 0.6], [84, 0]);
  const bottomCardScale = useTransform(smooth, [0.35, 0.72], [0.96, 1]);
  const bottomCardOpacity = useTransform(smooth, [0.3, 0.65], [0.35, 1]);

  return (
    <section
      id="fit"
      ref={sectionRef}
      className="relative mx-auto max-w-6xl px-6 py-28"
    >
      <Reveal>
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-10 md:flex-row md:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2.5 font-mono text-xs text-soft">
              <span className="text-terra">VII</span>
              <span>·</span>
              <span>How it fits a shop</span>
            </div>
            <h2 className="h-display max-w-2xl text-4xl text-ink sm:text-5xl">
              Starts from a spreadsheet. Changes nothing without a yes.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-soft">
            No machine retrofits or PLC wiring required. Drop in the schedule
            you already maintain and review every move before it reaches the
            floor.
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-8 md:grid-cols-2">
        {/* Card 01: Spreadsheet Input */}
        <motion.div
          style={{ y: leftCardY }}
          className="gpu-layer flex flex-col justify-between rounded-[32px] border border-line bg-ivory p-8 shadow-card"
        >
          <div>
            <div className="flex items-center justify-between border-b border-line pb-4">
              <span className="eyebrow">Input</span>
              <span className="rounded-full bg-cream px-2.5 py-0.5 font-mono text-[10px] text-soft">
                .xlsx / .csv
              </span>
            </div>
            <h3 className="h-display mt-6 text-[28px] text-ink">
              Excel or CSV in. No sensors needed.
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-soft">
              Job cards, machine eligibility, durations and due dates are enough
              to start. Disruptions arrive as plain-language reports, which are
              shown back to you for confirmation.
            </p>
          </div>

          <div className="mt-7 overflow-hidden rounded-2xl border border-[#3D3024] bg-[#211A14] shadow-inner">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-mono text-[10px] text-[#A39382]">
              <span>morning_shift_jobs.csv</span>
              <span className="text-[#8FA880]">Parsed cleanly</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-[#FAF3E8]">
              {csv}
            </pre>
          </div>
        </motion.div>

        {/* Card 02: Manager Approval */}
        <motion.div
          style={{ y: rightCardY }}
          className="gpu-layer flex flex-col justify-between rounded-[32px] border border-line bg-ivory p-8 shadow-card"
        >
          <div>
            <div className="flex items-center justify-between border-b border-line pb-4">
              <span className="eyebrow">Decision</span>
              <span className="rounded-full bg-terra/10 px-2.5 py-0.5 font-mono text-[10px] text-terra">
                Human-in-the-loop
              </span>
            </div>
            <h3 className="h-display mt-6 text-[28px] text-ink">
              The manager approves the plan.
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-soft">
              The proposal shows the affected jobs, what moved, and the delivery
              impact. Then you choose.
            </p>
          </div>

          <div className="mt-7 rounded-2xl border border-line bg-cream/75 p-6">
            <div className="flex items-center justify-between border-b border-line pb-3.5 text-sm">
              <span className="font-medium text-ink">
                Proposed recovery plan
              </span>
              <span className="rounded-full bg-ivory px-2.5 py-0.5 font-mono text-xs text-soft">
                4 of 25 moved
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {(["approve", "reject", "again"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChoice(k)}
                  className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 active:scale-[0.97] ${
                    choice === k
                      ? "bg-ink text-ivory shadow-sm"
                      : "border border-ink/20 bg-ivory text-ink hover:bg-ink/5"
                  }`}
                >
                  {k === "approve"
                    ? "Approve"
                    : k === "reject"
                      ? "Reject"
                      : "Request another plan"}
                </button>
              ))}
            </div>
            <div className="mt-4 h-5 font-mono text-xs text-terra">
              {choice && (
                <motion.span
                  key={choice}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {label[choice]}
                </motion.span>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Honest Scope Blueprint Box */}
      <motion.div
        style={{ scale: bottomCardScale, opacity: bottomCardOpacity }}
        className="gpu-layer mt-8 rounded-[32px] border border-dashed border-ink/25 bg-ivory/50 p-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">Honest limits</p>
          <span className="font-mono text-[11px] text-soft">
            Verification transparency
          </span>
        </div>
        <ul className="grid gap-x-10 gap-y-3.5 text-[15px] leading-relaxed text-soft md:grid-cols-2">
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
            <span>
              The benchmark uses synthetic job-shop instances and seeded
              disruption traces, not a live factory.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
            <span>
              Repair times are uncertain. We test how plans hold up when
              estimates are wrong.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
            <span>
              The solver works inside a time budget. That is not proof of
              optimality, so the gap is reported.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
            <span>
              This version works from CSV, manual reports and a simulated
              machine feed. Live PLC or IoT data is future work.
            </span>
          </li>
        </ul>
      </motion.div>
    </section>
  );
}