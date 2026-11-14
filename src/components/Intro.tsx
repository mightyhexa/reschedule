import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";

const ease = [0.22, 1, 0.36, 1] as const;
const bars = [
  { x: 0, w: 120, row: 0 }, { x: 130, w: 90, row: 0 },
  { x: 20, w: 80, row: 1 }, { x: 110, w: 130, row: 1 },
  { x: 0, w: 70, row: 2 }, { x: 80, w: 100, row: 2 },
];

export function Intro() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-cream"
          exit={{ y: "-100%", transition: { duration: 0.9, ease } }}
        >
          <div className="relative h-[84px] w-[260px]">
            {bars.map((b, i) => (
              <motion.div
                key={i}
                className="absolute h-5 rounded-md"
                style={{ left: b.x, top: b.row * 32, width: b.w, background: i === 3 ? "#B5443A" : "#2B2118" }}
                initial={{ scaleX: 0, opacity: 0, originX: 0 }}
                animate={i === 3 ? { scaleX: 1, opacity: 1, x: [0, 0, 40], backgroundColor: ["#B5443A", "#B5443A", "#7A8F6B"] } : { scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 + i * 0.09, ease, ...(i === 3 ? { x: { delay: 1.1, duration: 0.6, ease }, backgroundColor: { delay: 1.1, duration: 0.6 } } : {}) }}
              />
            ))}
          </div>
          <motion.div className="mt-10 flex items-center gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.7, ease }}>
            <LogoMark size={34} />
            <span className="font-display text-3xl text-ink">ReSchedule</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
