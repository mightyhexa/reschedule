import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";
import { toneAt } from "../lib/chrome";
import { DemoButton } from "../app/DemoButton";

const links = [
  ["50s Film", "#reel"],
  ["Problem", "#problem"],
  ["Approach", "#approach"],
  ["Try a disruption", "#try"],
  ["Proof", "#proof"],
  ["FAQ", "#faq"],
];

export function Nav() {
  const [tone, setTone] = useState<"light" | "dark">("light");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setTone(toneAt(window.innerWidth / 2, 4));
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

  const dark = tone === "dark";
  return (
    <motion.header
      data-chrome-ignore
      className="fixed inset-x-0 top-0 z-50 backdrop-blur-md transition-[background-color,color] duration-500"
      style={{
        backgroundColor: dark ? "rgba(21,17,14,0.72)" : "rgba(247,241,230,0.82)",
        color: dark ? "#F6F1E6" : "#2B2118",
      }}
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <a href="#top" aria-label="ReSchedule home">
          <Wordmark size={28} />
        </a>
        <nav className="hidden items-center gap-6 whitespace-nowrap xl:gap-7 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="link-draw py-1 text-sm opacity-70 transition-opacity duration-300 hover:opacity-100">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <a href="#/login" className="link-draw hidden whitespace-nowrap py-1 text-sm opacity-70 transition-opacity duration-300 hover:opacity-100 sm:block">
            Sign in
          </a>
          <DemoButton variant="nav" label="Live Workspace (1-Click)" className="hidden xl:inline-flex" />
          <DemoButton variant="nav" label="Live demo" className="md:hidden" />
          <a
            href="#pilot"
            className={`btn-fill hidden whitespace-nowrap rounded-full px-5 py-2 min-[480px]:inline-block text-sm font-medium ${dark ? "bg-ivory text-ink" : "bg-ink text-ivory"}`}
          >
            Request pilot access
          </a>
        </div>
      </div>
    </motion.header>
  );
}
