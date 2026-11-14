import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const containerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // High-frequency 120Hz spring smoothing for zero scroll-wheel stepping
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 34,
    mass: 0.18,
  });

  // Pinned hero recedes into a soft faded mist as the Problem curtain rises over it
  const stageScale = useTransform(smoothScroll, [0, 0.85], [1, 0.945]);
  const stageY = useTransform(smoothScroll, [0, 0.85], [0, -48]);
  const stageOpacity = useTransform(smoothScroll, [0, 0.72], [1, 0.12]);
  const ringRotate = useTransform(smoothScroll, [0, 1], [0, 18]);

  return (
    <section
      id="top"
      ref={containerRef}
      className="relative h-[126vh] select-none"
    >
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden hero-atmosphere">
        {/* Faded Vitruvian / architectural drafting backdrop */}
        <motion.div
          aria-hidden="true"
          style={{ rotate: ringRotate, scale: stageScale }}
          className="gpu-layer pointer-events-none absolute inset-0 flex items-center justify-center opacity-55"
        >
          <svg
            viewBox="0 0 1400 900"
            className="h-[115%] w-[115%] max-w-none text-ink/[0.07]"
            fill="none"
          >
            <circle cx="700" cy="450" r="390" stroke="currentColor" strokeWidth="1" />
            <circle
              cx="700"
              cy="450"
              r="540"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
            <circle cx="700" cy="450" r="220" stroke="currentColor" strokeWidth="0.75" />
            <line x1="0" y1="450" x2="1400" y2="450" stroke="currentColor" strokeWidth="0.75" />
            <line x1="700" y1="0" x2="700" y2="900" stroke="currentColor" strokeWidth="0.75" />
            <rect
              x="290"
              y="170"
              width="820"
              height="560"
              stroke="currentColor"
              strokeWidth="0.85"
            />
          </svg>
        </motion.div>

        {/* Soft atmospheric edge vignette */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(239,230,213,0.78)_100%)]"
        />

        {/* Foreground editorial stage */}
        <motion.div
          style={{ scale: stageScale, y: stageY, opacity: stageOpacity }}
          className="gpu-layer relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-14 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.65, duration: 0.85, ease }}
            className="mb-8 inline-flex items-center gap-3 rounded-full border border-ink/10 bg-ivory/60 px-4 py-1.5 backdrop-blur-sm"
          >
            <span className="font-mono text-[11px] text-terra">I — XII</span>
            <span className="h-3 w-px bg-ink/15" />
            <span className="text-xs text-soft">
              Calm schedule recovery for factory floors
            </span>
          </motion.div>

          <h1 className="h-editorial max-w-4xl text-[46px] text-ink sm:text-[68px] md:text-[84px]">
            {[
              { text: "When one machine stops,", italic: false },
              { text: "nothing else loses", italic: false },
              { text: "its place.", italic: true },
            ].map((line, i) => (
              <span key={line.text} className="block overflow-hidden pb-1.5">
                <motion.span
                  className="gpu-layer block"
                  initial={{ y: "108%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  transition={{
                    delay: 1.72 + i * 0.11,
                    duration: 1.05,
                    ease,
                  }}
                >
                  {line.italic ? (
                    <em className="font-light italic text-terra">{line.text}</em>
                  ) : (
                    line.text
                  )}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className="mt-7 max-w-xl text-base font-normal leading-relaxed text-soft sm:text-[18px]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.1, duration: 0.9, ease }}
          >
            A breakdown at 10:15 AM shouldn’t reshuffle every operator’s day.
            ReSchedule freezes work already in motion and slides only the jobs
            waiting on the stopped machine.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.25, duration: 0.9, ease }}
          >
            <a
              href="#problem"
              className="rounded-full bg-ink px-7 py-3 text-sm font-normal text-ivory btn-fill"
            >
              Scroll the repair
            </a>
            <a
              href="#pilot"
              className="rounded-full border border-ink/15 bg-ivory/70 px-7 py-3 text-sm font-normal text-ink backdrop-blur-sm btn-ghost"
            >
              Run on your job cards
            </a>
          </motion.div>

          {/* Minimalist Roman Numeral Preview Rail */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.45, duration: 1 }}
            className="mt-16 grid w-full max-w-2xl grid-cols-3 border-t border-ink/10 pt-5 text-left"
          >
            {[
              ["I", "10:00 AM", "25 jobs running on time"],
              ["II", "10:15 AM", "Machine 3 stops for 4 hours"],
              ["III", "10:15 AM", "4 jobs slide · 21 stay put"],
            ].map(([num, time, desc]) => (
              <a
                key={num}
                href="#problem"
                className="group pr-4 transition-opacity hover:opacity-100"
              >
                <div className="flex items-baseline gap-2 font-mono text-[11px] text-soft">
                  <span className="text-terra">{num}</span>
                  <span>{time}</span>
                </div>
                <p className="mt-1 text-xs text-ink/80 group-hover:text-ink">
                  {desc}
                </p>
              </a>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}