import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { ForgetMe, openPolicy } from "./PolicyModal";
import type { PolicyTab } from "./PolicyModal";

const P = [
  {
    n: "01",
    t: "What we collect",
    b: "Only what you type into the pilot form: name, role, shop name, cluster and machine count. Job cards you upload are used to build your schedule and nothing else.",
  },
  {
    n: "02",
    t: "How it is used",
    b: "To contact you about a pilot and to run schedule repairs on your own data. We do not sell data and we do not use your job cards to train models.",
  },
  {
    n: "03",
    t: "Your control",
    b: "Ask us to export or delete your pilot request and uploaded job cards at any time. Deletion covers backups within a stated window.",
  },
  {
    n: "04",
    t: "Prototype notice",
    b: "ReSchedule is a hackathon prototype. Demo figures come from a synthetic shop and are labelled as such until the benchmark has been run.",
  },
];

export function Policies() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    mass: 0.2,
  });

  const c1Y = useTransform(smooth, [0.05, 0.45], [32, 0]);
  const c2Y = useTransform(smooth, [0.12, 0.52], [56, 0]);
  const c3Y = useTransform(smooth, [0.18, 0.58], [80, 0]);
  const c4Y = useTransform(smooth, [0.24, 0.64], [104, 0]);
  const cardTransforms = [c1Y, c2Y, c3Y, c4Y];

  return (
    <section id="policies" ref={ref} className="mx-auto max-w-6xl px-6 py-28">
      <div className="grid gap-14 md:grid-cols-[0.8fr_1.2fr]">
        <div className="md:sticky md:top-28 md:self-start">
          <div className="mb-4 flex items-center gap-2.5 font-mono text-xs text-soft">
            <span className="text-terra">X</span>
            <span>·</span>
            <span>Governance</span>
          </div>
          <h2 className="h-display text-4xl text-ink sm:text-5xl">
            Your shop floor data stays yours.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-soft">
            Plain-language policies. Read them in under a minute.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => openPolicy("terms")} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ivory">Full terms and privacy policy</button>
            <button type="button" onClick={() => openPolicy("data")} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5">Delete my data</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {P.map((p, i) => (
            <motion.article
              key={p.t}
              style={{ y: cardTransforms[i] }}
              className="gpu-layer flex flex-col justify-between rounded-[28px] border border-line bg-ivory p-7 shadow-card"
            >
              <div>
                <span className="font-mono text-xs text-terra">{p.n}</span>
                <h3 className="h-display mt-4 text-2xl text-ink">{p.t}</h3>
                <p className="mt-3 text-[14.5px] leading-relaxed text-soft">
                  {p.b}
                </p>
              </div>
              {p.n === "03" && <div className="mt-4"><ForgetMe /></div>}
              <button type="button" onClick={() => openPolicy((["privacy", "privacy", "data", "prototype"] as PolicyTab[])[i])} className="mt-4 w-fit text-left text-xs text-terra underline underline-offset-4">Read the full text</button>
              <div className="mt-6 h-px w-full bg-line" />
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}