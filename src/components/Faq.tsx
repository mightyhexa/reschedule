import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Reveal } from "./Reveal";

const qa = [
  [
    "Is this just a solver?",
    "A constraint solver is the engine. The product is everything around it: a plain-language event in, a priced list of moved jobs out, and a manager's approval before anything changes.",
  ],
  [
    "Is a two-second answer optimal?",
    "No. Two seconds is a time budget. ReSchedule returns the best plan it found in that budget and reports the optimality gap, so you can see how close it is.",
  ],
  [
    "What does recovery time mean here?",
    "Two different numbers. Re-plan time is how long the solver takes. Recovery time is how long the shop takes to get back on track. We report them separately.",
  ],
  [
    "Why not simply push everything later?",
    "Right-shift is very stable, but on a long breakdown it can miss due dates. It is one of the four baselines in the benchmark, so the comparison is direct.",
  ],
  [
    "Where does the benchmark data come from?",
    "Synthetic job-shop instances and seeded disruption traces, so every strategy faces identical disruptions. The seed is published with the results.",
  ],
  [
    "What if the AI misreads a note?",
    "It never acts on its own. Every parsed event is shown for confirmation before it reaches the solver, and every proposed plan waits for manager approval.",
  ],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-6xl px-6 py-28">
      <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <div className="mb-4 flex items-center gap-2.5 font-mono text-xs text-soft">
              <span className="text-terra">VIII</span>
              <span>·</span>
              <span>Questions</span>
            </div>
            <h2 className="h-display text-4xl text-ink sm:text-5xl">
              The hard ones, answered plainly.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-soft">
              Direct answers on solver speed, shop-floor stability, and how
              every schedule change stays under human control.
            </p>
          </div>
        </Reveal>

        <div className="divide-y divide-line rounded-[32px] border border-line bg-ivory px-7 shadow-card sm:px-9">
          {qa.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-terra">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="h-display text-xl text-ink transition-colors group-hover:text-terra md:text-2xl">
                      {q}
                    </span>
                  </div>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-cream/60 text-lg text-terra"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-2xl pb-7 pl-8 text-[16px] leading-relaxed text-soft">
                        {a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}