import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { Wordmark } from "./Logo";
import { CloudSky } from "./CloudSky";
import { openPolicy } from "./PolicyModal";
import type { PolicyTab } from "./PolicyModal";

/** A link target starting with "policy:" opens the terms window instead of scrolling. */
const isPolicy = (h: string) => h.startsWith("policy:");

const NAV_COLUMNS: { heading: string; links: [string, string][] }[] = [
  {
    heading: "Product",
    links: [
      ["Start pilot", "#pilot"],
      ["Live repair", "#problem"],
      ["Three rules", "#approach"],
      ["Disruptions", "#try"],
      ["Job card deck", "#jobs"],
      ["Shift runner", "#play"],
      ["Benchmark", "#proof"],
      ["CSV format", "#fit"],
    ],
  },
  {
    heading: "Solutions",
    links: [
      ["Small CNC shops", "#pilot"],
      ["Fabrication units", "#pilot"],
      ["Sheet-metal lines", "#pilot"],
      ["Tool & die rooms", "#pilot"],
      ["Batch production", "#jobs"],
    ],
  },
  {
    heading: "Company",
    links: [
      ["About ReSchedule", "#top"],
      ["Built by Fahad", "#connect"],
      ["Contact", "#connect"],
      ["Live workspace", "#/app"],
    ],
  },
  {
    heading: "Legal",
    links: [
      ["Legal & Policies", "#policies"],
      ["Data ownership", "policy:privacy"],
      ["Usage terms", "policy:terms"],
      ["Deletion rights", "policy:data"],
      ["Prototype notice", "policy:prototype"],
      ["FAQ", "#faq"],
    ],
  },
];


const GH = "M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z";
const WA = "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.1a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 12 20.100zm4.5-6c-.2-.1-1.500-.7-1.700-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.600 6.600 0 0 1-3.300-2.900c-.2-.4.2-.4.700-1.300.1-.2 0-.3 0-.5l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.200c0 1.300.9 2.500 1 2.700.1.200 1.800 2.800 4.400 3.900 1.600.7 2.300.7 3.100.6.500-.1 1.500-.6 1.700-1.200.2-.6.2-1.100.2-1.200l-.5-.3z";

const CONNECT = [
  { label: "GitHub", handle: "mightyhexa", href: "https://github.com/mightyhexa", icon: "gh" },
  { label: "Instagram", handle: "@f1xwd_", href: "https://www.instagram.com/f1xwd_", icon: "ig" },
  { label: "WhatsApp", handle: "+91 91216 13624", href: "https://wa.me/919121613624?text=Hi%20Fahad%2C%20I%20saw%20ReSchedule.", icon: "wa" },
] as const;

function SocialIcon({ kind }: { kind: "gh" | "ig" | "wa" }) {
  if (kind === "ig")
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true">
      <path d={kind === "gh" ? GH : WA} />
    </svg>
  );
}

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ["start end", "end end"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 30,
    mass: 0.2,
  });

  // Parallax for the floating schedule blocks
  const artY = useTransform(smooth, [0, 1], [42, -12]);
  const repairedBlockX = useTransform(smooth, [0.15, 0.72], [0, 68]);

  return (
    <footer ref={footerRef} className="bg-dot-matrix relative pt-6 pb-14">
      {/* 1. Panoramic Sky & Fluffy Cloud Horizon Window (Matches top of reference image) */}
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <div className="sky-panorama relative min-h-[390px] overflow-hidden rounded-[36px] border border-white/50 shadow-[0_28px_70px_-28px_rgba(43,33,24,0.28)] sm:min-h-[430px] sm:rounded-[44px]">
          <CloudSky />

          {/* Center ReSchedule Sky Horizon Art & Callout */}
          <motion.div
            style={{ y: artY }}
            className="gpu-layer relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-12 pb-24 text-center sm:pt-14"
          >
            <h2 className="h-display max-w-2xl text-4xl text-white drop-shadow-[0_2px_18px_rgba(27,58,112,0.28)] sm:text-5xl md:text-[56px]">
              When the day breaks, repair the plan in two seconds.
            </h2>

            {/* Interactive Scroll-Animated Sky Schedule Sculpture */}
            <div className="mt-7 w-full max-w-xl rounded-2xl border border-white/75 bg-ivory/90 p-4 shadow-[0_20px_50px_-18px_rgba(24,48,89,0.38)] backdrop-blur-md">
              <div className="mb-2.5 flex items-center justify-between text-[12.5px] text-soft">
                <span>Example repair on M1 to M3</span>
                <span>4 jobs slid, the rest stayed put</span>
              </div>
              <div className="space-y-1.5">
                {/* Row M1: Locked */}
                <div className="flex items-center gap-2">
                  <span className="w-6 font-mono text-[10px] text-soft">M1</span>
                  <div className="grid h-6 flex-1 grid-cols-4 gap-1.5">
                    {["J-01", "J-02", "J-03", "J-04"].map((j) => (
                      <div
                        key={j}
                        className="flex items-center justify-center rounded border border-[#7A8F6B]/70 bg-[#E4EBDD] font-mono text-[10px] text-ink"
                      >
                        {j}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Row M3: Scroll-repaired line */}
                <div className="flex items-center gap-2">
                  <span className="w-6 font-mono text-[10px] text-terra">
                    M3
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-ink/[0.04]">
                    <div className="absolute inset-y-0 left-0 flex w-[23%] items-center justify-center rounded border border-[#7A8F6B]/70 bg-[#E4EBDD] font-mono text-[10px] text-ink">
                      J-09
                    </div>
                    <div className="hatch absolute inset-y-0 left-[25%] flex w-[18%] items-center justify-center rounded border border-brick/50 font-mono text-[9px] text-brick">
                      4h stop
                    </div>
                    <motion.div
                      style={{ x: repairedBlockX }}
                      className="gpu-layer absolute inset-y-0 left-[26%] flex w-[52%] gap-1.5"
                    >
                      <div className="flex flex-1 items-center justify-center rounded border border-terra bg-[#F8DDB0] font-mono text-[10px] text-ink">
                        J-10 slid
                      </div>
                      <div className="flex flex-1 items-center justify-center rounded border border-terra bg-[#F8DDB0] font-mono text-[10px] text-ink">
                        J-11 slid
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#pilot"
                className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-ivory shadow-card btn-fill"
              >
                Start pilot on your job cards
              </a>
              <a
                href="#top"
                className="rounded-full border border-ink/15 bg-white/85 px-5 py-2.5 text-sm font-medium text-ink backdrop-blur-sm transition-colors hover:bg-white"
              >
                Back to top ↑
              </a>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 2. Foundable-Style 4-Column Directory on Dot-Matrix Canvas */}
      <div className="mx-auto max-w-6xl px-6 pt-16">
        <div className="grid gap-12 pb-16 lg:grid-cols-[1.1fr_2fr]">
          {/* Brand Lockup Column */}
          <div className="flex flex-col justify-between">
            <div>
              <a href="#top" aria-label="ReSchedule home">
                <Wordmark size={32} />
              </a>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-soft">
                Disruption recovery for MSME job shops. Repair the schedule you
                have without rebuilding the floor from scratch.
              </p>
            </div>
            <div id="connect" className="mt-8 scroll-mt-24">
              <p className="text-sm font-semibold text-ink">Built by Fahad</p>
              <ul className="mt-3 space-y-2">
                {CONNECT.map((c) => (
                  <li key={c.label}>
                    <a href={c.href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-3 text-sm text-soft transition-colors hover:text-ink">
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-ivory text-ink transition-colors group-hover:border-ink/40">
                        <SocialIcon kind={c.icon} />
                      </span>
                      <span><span className="text-ink">{c.label}</span> · {c.handle}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 4-Column Navigation Matrix (Product, Solutions, Company, Legal) */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {NAV_COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="text-sm font-semibold text-ink">
                  {col.heading}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <a
                        href={isPolicy(href) ? "#policies" : href}
                        onClick={isPolicy(href) ? (e) => { e.preventDefault(); openPolicy(href.slice(7) as PolicyTab); } : undefined}
                        className="text-sm text-soft transition-colors link-draw hover:text-ink"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Bottom Hairline Bar: Copyright, Language Globe, and Social Icons */}
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pb-44 pt-8 sm:pb-24 text-xs sm:pr-[280px] text-soft sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-6">
            <span>© 2026 ReSchedule · Built by Fahad</span>
            <span className="inline-flex items-center gap-1.5 text-ink/80">
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 text-soft"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="6.2" />
                <ellipse cx="8" cy="8" rx="3" ry="6.2" />
                <line x1="1.8" y1="8" x2="14.2" y2="8" />
              </svg>
              English
            </span>
          </div>

          <div className="flex items-center gap-5 text-ink/75">
            <a href="#pilot" className="text-xs transition-colors link-draw hover:text-ink">Pilot contact</a>
            <a href="#/app" className="text-xs transition-colors link-draw hover:text-ink">Live workspace</a>
          </div>
        </div>
      </div>
    </footer>
  );
}