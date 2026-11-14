import { useMotionValue } from "framer-motion";
import { Duck } from "./Duck";
import { COSTUME_LIST, MOODS } from "./types";
import type { Costume, Mood } from "./types";

/** Dev-only contact sheet (#/duck-lab). Not shipped in the production build. */
export function DuckLab() {
  const look = { x: useMotionValue(0), y: useMotionValue(0) };
  const cell = (m: Mood, c: Costume) => (
    <div key={`${m}-${c}`} className="w-[120px] text-center font-mono text-[10px] text-soft">
      <Duck mood={m} costume={c} look={look} className="block h-auto w-full" />
      {m} · {c}
    </div>
  );
  return (
    <div className="min-h-screen bg-cream p-6">
      <h1 className="mb-3 font-display text-2xl">Moods</h1>
      <div className="flex flex-wrap gap-4">{MOODS.map((m) => cell(m, "foreman"))}</div>
      <h1 className="mb-3 mt-8 font-display text-2xl">Costumes</h1>
      <div className="flex flex-wrap gap-4">{COSTUME_LIST.map((c) => cell("calm", c.id))}</div>
    </div>
  );
}
