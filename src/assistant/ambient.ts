import { useEffect, useState } from "react";

export interface Bench {
  rs?: { moved_pct: number; on_time_pct: number };
  full?: { moved_pct: number; on_time_pct: number };
}

/** The headline numbers come from the measured file the Proof section also shows, never from this code. */
export function useBench(): Bench {
  const [b, setB] = useState<Bench>({});
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}data/benchmark.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d?.strategies) return;
        const pick = (id: string) => d.strategies.find((s: any) => s.id === id)?.metrics;
        const rs = pick("reschedule");
        const full = pick("global_cpsat");
        setB({ rs: rs && { moved_pct: rs.moved_pct, on_time_pct: rs.on_time_pct }, full: full && { moved_pct: full.moved_pct, on_time_pct: full.on_time_pct } });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return b;
}

/** One dry line per place. Returns null when there is nothing honest to say. */
export function ambientLine(key: string, b: Bench): string | null {
  switch (key) {
    case "reel":
      return "Fifty seconds. The chai stays hot.";
    case "problem":
      return b.full ? `A full rebuild moved ${b.full.moved_pct}% of the operations in our test shop. The operators noticed.` : "One motor overheats and the whole board gets reshuffled. Sound familiar?";
    case "approach":
      return "Protect, slide, approve. Three rules, no drama.";
    case "try":
      return "Go on, break a machine. I'll wait.";
    case "proof":
      return b.rs ? `Same test shop: ReSchedule moved ${b.rs.moved_pct}% and landed ${b.rs.on_time_pct}% on time. Synthetic, but honest.` : null;
    case "play":
      return "Mind the oil spill.";
    case "fit":
      return "Five to twenty-five machines? Then I'm talking to you.";
    case "pilot":
      return "Pilot is Rs 2,999 a month. Nothing changes on your floor without your approval.";
    case "policies":
      return "Your job cards stay yours. I read the small print so you don't have to.";
    case "/app/events":
      return "Machine down? Tell me in plain words and I'll set it up.";
    case "/app/review":
      return "Check what moved, then approve. I'll bring the stamp.";
    case "/app/upload":
      return "Excel, CSV or a Word table. I'm not fussy.";
    case "/app/team":
      return "Operators only look. Managers approve. That's the whole trick.";
    case "/app/history":
      return "Every plan and every decision is in here. Nothing gets lost.";
    default:
      return null;
  }
}
