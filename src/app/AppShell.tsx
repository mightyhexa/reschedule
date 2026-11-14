import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useState } from "react";
import type { ReactNode } from "react";
import { Wordmark } from "../components/Logo";
import { useAuth } from "./auth";
import { go, useHashPath } from "./router";
import { Badge, ease } from "./ui";

const STEPS = [
  { n: 1, to: "/app/upload", title: "Upload or pick jobs", hint: "Excel, CSV, Word, or type them in" },
  { n: 2, to: "/app/events", title: "Report what broke", hint: "Machine down, rush order, power cut…" },
  { n: 3, to: "/app", title: "Compare and approve the repair", hint: "See before and after, then say yes" },
] as const;

/** Which of the three steps the person is on, from the page they are looking at. */
function stepFor(path: string): number {
  if (path.startsWith("/app/upload")) return 1;
  if (path.startsWith("/app/events")) return 2;
  if (path.startsWith("/app/review")) return 3;
  return 0;
}

function StepsBanner({ path, canPlan }: { path: string; canPlan: boolean }) {
  const on = stepFor(path);
  return (
    <nav aria-label="How it works" className="mb-8 grid gap-2 rounded-[22px] border border-line bg-ivory p-2 shadow-card sm:grid-cols-3">
      {STEPS.map((s) => {
        const active = on === s.n;
        const blocked = !canPlan && s.n < 3;
        return (
          <a key={s.n} href={blocked ? undefined : `#${s.to}`} aria-current={active ? "step" : undefined}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${active ? "bg-ink text-ivory" : "hover:bg-ink/5"} ${blocked ? "pointer-events-none opacity-50" : ""}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-sm ${active ? "bg-terra text-ivory" : "bg-cream text-ink"}`}>{s.n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{s.title}</span>
              <span className={`block truncate text-xs ${active ? "text-ivory/70" : "text-soft"}`}>{s.hint}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}

const icon = {
  plan: "M3 6h12M3 12h8M3 18h14",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 20h16",
  event: "M13 2L4 14h7l-1 8 9-12h-7z",
  history: "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  team: "M16 11a4 4 0 1 0-8 0m-5 9a8 8 0 0 1 16 0M17 8a3 3 0 0 1 3 3m1 9a6 6 0 0 0-3-5",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0",
  admin: "M4 5h16M4 12h16M4 19h10",
};

function Ico({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const roleTone = { owner: "ink", manager: "terra", planner: "sage", operator: "soft" } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const path = useHashPath();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const items: { to: string; label: string; ic: string; show: boolean; match: (p: string) => boolean }[] = [
    { to: "/app", label: "Plan", ic: icon.plan, show: true, match: (p) => p === "/app" },
    { to: "/app/upload", label: "Job cards", ic: icon.upload, show: can("plan"), match: (p) => p.startsWith("/app/upload") },
    { to: "/app/events", label: "Disruptions", ic: icon.event, show: can("plan"), match: (p) => p.startsWith("/app/events") || p.startsWith("/app/review") },
    { to: "/app/history", label: "History", ic: icon.history, show: true, match: (p) => p.startsWith("/app/history") },
    { to: "/app/team", label: "Team", ic: icon.team, show: true, match: (p) => p.startsWith("/app/team") },
    { to: "/app/account", label: "Account", ic: icon.account, show: true, match: (p) => p.startsWith("/app/account") },
    { to: "/app/admin", label: "Pilot requests", ic: icon.admin, show: user.is_admin, match: (p) => p.startsWith("/app/admin") },
  ];

  const nav = (
    <nav className="mt-8 grid gap-1" aria-label="Main">
      <LayoutGroup id="side">
        {items.filter((i) => i.show).map((i) => {
          const on = i.match(path);
          return (
            <a key={i.to} href={`#${i.to}`} onClick={() => setOpen(false)}
              className={`relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-colors ${on ? "text-ivory" : "text-soft hover:bg-ink/5 hover:text-ink"}`}>
              {on && <motion.span layoutId="pill" transition={{ type: "spring", stiffness: 380, damping: 32 }} className="absolute inset-0 rounded-2xl bg-ink" />}
              <span className="relative z-10"><Ico d={i.ic} /></span>
              <span className="relative z-10 font-medium">{i.label}</span>
            </a>
          );
        })}
      </LayoutGroup>
    </nav>
  );

  const profile = (
    <div className="mt-auto rounded-2xl border border-line bg-cream/60 p-4">
      <div className="truncate text-sm font-medium text-ink">{user.name}</div>
      <div className="mb-3 mt-1 flex items-center gap-2">
        <Badge tone={roleTone[user.role]}>{user.role}</Badge>
        <span className="truncate text-xs text-soft">{user.shop.name}</span>
      </div>
      <button onClick={logout} className="text-xs text-soft underline underline-offset-4 transition-colors hover:text-brick">Sign out</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-ivory/70 p-6 backdrop-blur lg:flex">
        <a href="#" onClick={() => (location.hash = "")} aria-label="ReSchedule home"><Wordmark size={26} /></a>
        {nav}
        {profile}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-cream/85 px-5 py-3 backdrop-blur lg:hidden">
        <Wordmark size={22} />
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu" className="rounded-full border border-line px-4 py-1.5 text-sm">Menu</button>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3, ease }}
            className="fixed inset-x-0 top-[57px] z-30 flex max-h-[calc(100vh-57px)] flex-col overflow-auto border-b border-line bg-ivory p-5 lg:hidden">
            {nav}
            <div className="mt-6">{profile}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-6xl">
          {user.demo && (
            <div className="mb-4 rounded-2xl border border-terra/30 bg-terra/5 px-4 py-2.5 text-sm text-ink">
              <b>Demo workspace.</b> This private sample shop is yours to break. It is deleted after 24 hours. <a className="underline underline-offset-4" href="#/signup">Create a real account</a>
            </div>
          )}
          <StepsBanner path={path} canPlan={can("plan")} />
          {/* Enter-only transition: keyed by route so each page fades in once. No exit phase, so a page is never mounted twice. */}
          <motion.div key={path.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, ease }}>
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export { go };
