import { useEffect, useState } from "react";
import { toneAt } from "../lib/chrome";

const TOC = [
  { id: "top", label: "Overview" },
  { id: "reel", label: "50s Film" },
  { id: "problem", label: "Breakdown" },
  { id: "approach", label: "Three Rules" },
  { id: "try", label: "Disruptions" },
  { id: "proof", label: "Benchmark" },
  { id: "jobs", label: "Job Cards" },
  { id: "play", label: "Shift Line" },
  { id: "fit", label: "Shop Fit" },
  { id: "pilot", label: "Pilot Access" },
] as const;

export function LeftRail() {
  const [activeId, setActiveId] = useState<string>("top");
  const [tone, setTone] = useState<"light" | "dark">("light");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.innerHeight * 0.4;
      for (let i = TOC.length - 1; i >= 0; i--) {
        const el = document.getElementById(TOC[i].id);
        if (el && el.getBoundingClientRect().top <= y) {
          setActiveId(TOC[i].id);
          break;
        }
      }
      setTone(toneAt(72, window.innerHeight - 140));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <aside
      data-chrome-ignore
      aria-label="Page sections"
      className="pointer-events-none fixed bottom-7 left-6 z-40 hidden w-[150px] select-none xl:block"
      style={{ color: tone === "dark" ? "#F6F1E6" : "#2B2118", transition: "color 400ms ease" }}
    >
      <nav className="pointer-events-auto flex flex-col gap-1">
        {TOC.map((item, i) => {
          const active = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="group flex items-baseline gap-2 text-[13px] leading-[1.25] tracking-[-0.01em] transition-[opacity,transform] duration-300"
              style={{ opacity: active ? 1 : 0.42, transform: active ? "translateX(4px)" : "none" }}
            >
              <span className="w-4 font-mono text-[9.5px] tabular-nums opacity-70">{String(i + 1).padStart(2, "0")}</span>
              <span className={`link-draw ${active ? "font-semibold" : ""} group-hover:opacity-100`}>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
