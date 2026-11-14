import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gantt } from "./Gantt";
import { build } from "../lib/schedule";

const CHAPTERS = [
  {
    roman: "I",
    time: "10:00 AM",
    swash: "T",
    title: "wenty-five jobs, lined up and running.",
    body: "Five machines (M1 to M5) each have five jobs scheduled for the shift. Parts are staged at every station and operators know exactly what runs next.",
  },
  {
    roman: "II",
    time: "10:15 AM",
    swash: "M",
    title: "achine 3 overheats and stops for four hours.",
    body: "A spindle motor trips on Machine 3. The four jobs waiting in line behind it cannot start on time, making the printed wall schedule obsolete.",
  },
  {
    roman: "III",
    time: "10:15 AM + 2s",
    swash: "S",
    title: "lide the four blocked jobs. Leave twenty-one alone.",
    body: "Rebuilding from scratch scrambles 20 jobs across healthy machines. ReSchedule locks the 21 healthy jobs in place and slides only the 4 waiting jobs on Machine 3.",
  },
] as const;

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // The story finishes after ~210vh; the last 100vh belongs to the paper reveal.
  const narrative = useTransform(scrollYProgress, [0, 0.68], [0, 1], { clamp: true });
  const smoothP = useSpring(narrative, {
    stiffness: 240,
    damping: 32,
    mass: 0.2,
  });

  const { naive, stable, windows, naiveMoved, stableMoved, total } = useMemo(
    () => build("breakdown"),
    []
  );

  // Shrink the scene a little on short screens so the heading never hides under the nav.
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const f = () => setFit(Math.max(0.62, Math.min(1, (window.innerHeight - 88) / 700)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const [activeIdx, setActiveIdx] = useState(0);
  useMotionValueEvent(narrative, "change", (v) => {
    const next = v < 0.28 ? 0 : v < 0.62 ? 1 : 2;
    if (next !== activeIdx) setActiveIdx(next);
  });

  const winOp = useTransform(smoothP, [0.2, 0.34], [0, 1], { clamp: true });
  const repairProgress = useTransform(smoothP, [0.52, 0.84], [0, 1], {
    clamp: true,
  });

  // Painted backdrop slow push-in (1.00 -> 1.08 per Section 7 of Brief)
  const artScale = useTransform(smoothP, [0, 1], [1, 1.08]);
  const sCount = useTransform(repairProgress, (v) =>
    Math.round(v * stableMoved)
  );
  const nCount = useTransform(repairProgress, (v) =>
    Math.round(v * naiveMoved)
  );

  const scrollToStep = (idx: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pageTop = window.scrollY + rect.top;
    const scrollable = el.offsetHeight - window.innerHeight;
    const ratios = [0.06, 0.45, 0.88].map((r) => r * 0.68);
    window.scrollTo({
      top: pageTop + scrollable * ratios[idx],
      behavior: "smooth",
    });
  };

  return (
    <section
      id="problem"
      ref={sectionRef}
      data-chrome="dark"
      className="relative z-20 h-[410vh] bg-[#1D1619] text-[#F6F4EC]"
    >
      <div className="sticky top-0 flex h-screen w-full items-start overflow-hidden dark-guide-grid">
        {/* Background Layer: Chiaroscuro Renaissance Workshop Painting + Vignette */}
        <motion.div
          aria-hidden="true"
          style={{ scale: artScale }}
          className="gpu-layer pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_45%,rgba(200,100,59,0.22),rgba(29,22,25,0.88)_58%,#1D1619_90%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1D1619] via-transparent to-[#1D1619]/90" />
        </motion.div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-[calc(var(--header-h)+22px)] xl:pl-28">
          <div style={{ zoom: fit }}>
          {/* Top Monumental Neo-Grotesk Scene Banner */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[12.5px] font-medium text-[#ADACA1]">
                <span>The shop-floor dilemma</span>
              </div>
              <p className="scene-word text-[#F6F4EC]/95">THE BREAKDOWN</p>
            </div>

            {/* Interactive Step Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              {CHAPTERS.map((ch, i) => {
                const on = i === activeIdx;
                return (
                  <button
                    key={ch.roman}
                    type="button"
                    onClick={() => scrollToStep(i)}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-all duration-200 ${
                      on
                        ? "border-[#F6F4EC] bg-[#F6F4EC] font-semibold text-[#262616]"
                        : "border-white/15 bg-white/[0.04] text-[#ADACA1] hover:border-white/35 hover:text-white"
                    }`}
                  >
                    {ch.time}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Split Grid: Left Swash Narrative + Right Dual Non-Overlapping Boards */}
          <div className="grid items-center gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            {/* Left Column: Swash Drop-Cap Narrative */}
            <div className="space-y-6">
              <div className="relative min-h-[185px]">
                {CHAPTERS.map((ch, i) => {
                  const on = i === activeIdx;
                  return (
                    <motion.div
                      key={ch.roman}
                      initial={false}
                      animate={{
                        opacity: on ? 1 : 0,
                        y: on ? 0 : i < activeIdx ? -16 : 16,
                      }}
                      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                      className={`gpu-layer ${
                        on
                          ? "relative pointer-events-auto"
                          : "pointer-events-none absolute inset-0"
                      }`}
                    >
                      <h2 className="h-display text-3xl text-[#F6F4EC] sm:text-4xl">
                        <span className="swash">{ch.swash}</span>
                        {ch.title}
                      </h2>

                      <p className="mt-3.5 text-[15.5px] leading-relaxed text-[#D0C8BC]">
                        {ch.body}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Visual Judge Summary Strip */}
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#282818]/90 p-4">
                <div className="border-r border-white/10 pr-3">
                  <span className="text-[13px] font-medium text-[#A9C29A]">
                    ReSchedule repair
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl text-[#F6F4EC]">
                      21
                    </span>
                    <span className="text-sm text-[#ADACA1]">
                      of 25 jobs stay put
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#ADACA1]">
                    Only the 4 jobs waiting on M3 slide
                  </p>
                </div>

                <div className="pl-1">
                  <span className="text-[13px] font-medium text-[#EF8A7E]">
                    Rebuild from scratch
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl text-[#EF6B5E]">
                      20
                    </span>
                    <span className="text-sm text-[#ADACA1]">
                      of 25 jobs reshuffled
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#ADACA1]">
                    Every operator loses their setup
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Clean Stacked Comparison Boards */}
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#8FA880]/35 bg-[#241E1A]/95 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div className="text-[15px] font-medium text-[#F6F4EC]">ReSchedule repair</div>
                  <div className="text-sm text-[#D0C8BC]">
                    <motion.span className="font-display text-xl text-[#F6F4EC]">{sCount}</motion.span> of {total} jobs moved
                  </div>
                </div>

                <Gantt
                  placed={stable}
                  progress={repairProgress}
                  windows={windows}
                  windowOpacity={winOp}
                  rowH={24}
                  variant="dark"
                />

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 font-mono text-[11px] text-[#ADACA1]">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm border border-[#4A5D43] bg-[#293526]" />
                      Locked in place (21)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm border border-[#E0A33A] bg-[#4A3219]" />
                      Slid on M3 (4)
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-line bg-ivory p-4 text-ink shadow-lift">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[15px] font-medium text-ink">Rebuild from scratch <span className="font-normal text-soft">(shuffles M1, M2, M4 and M5 as well)</span></div>
                  <div className="text-sm text-soft">
                    <motion.span className="font-display text-xl text-brick">{nCount}</motion.span> of {total} jobs moved
                  </div>
                </div>

                <Gantt
                  placed={naive}
                  progress={repairProgress}
                  windows={windows}
                  windowOpacity={winOp}
                  rowH={17}
                  variant="light"
                />
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}