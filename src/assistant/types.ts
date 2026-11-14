export type Mood = "calm" | "panic" | "surgical" | "smug" | "listening" | "laughing" | "sleepy" | "approved" | "empathetic";
export type Costume = "foreman" | "medic" | "hacker" | "boss" | "inspector" | "vip";

export const MOODS: Mood[] = ["calm", "panic", "surgical", "smug", "listening", "laughing", "sleepy", "approved", "empathetic"];
export const COSTUME_LIST: { id: Costume; label: string; tip: string }[] = [
  { id: "foreman", label: "Floor Foreman", tip: "Hard hat and brass caliper" },
  { id: "medic", label: "Breakdown Medic", tip: "Siren helmet and welding goggles" },
  { id: "hacker", label: "Night Shift", tip: "Amber headset and hoodie" },
  { id: "boss", label: "Shop Boss", tip: "Aviators and cutting chai" },
  { id: "inspector", label: "Data Inspector", tip: "Monocle and the Excel scroll" },
  { id: "vip", label: "Judge VIP", tip: "Cape, crown and gavel" },
];

export const isMood = (v: unknown): v is Mood => typeof v === "string" && (MOODS as string[]).includes(v);
export const isCostume = (v: unknown): v is Costume => typeof v === "string" && COSTUME_LIST.some((c) => c.id === v);

export const SECTIONS = ["top", "reel", "problem", "approach", "try", "proof", "jobs", "play", "fit", "faq", "pilot", "policies"] as const;

/** Costume that fits a landing section or a portal page. */
export function costumeFor(key: string): Costume {
  switch (key) {
    case "reel":
    case "/app":
    case "/app/plan":
      return "hacker";
    case "problem":
    case "/app/events":
      return "medic";
    case "pilot":
    case "/app/team":
      return "boss";
    case "proof":
    case "/app/upload":
      return "inspector";
    default:
      return "foreman";
  }
}

export type Action = { kind: "scroll"; id: string } | { kind: "route"; to: string };

const ROUTE_OK = /^#\/(login|signup|app(\/(plan|upload|events|history|team|account|review\/[A-Za-z0-9_-]{6,64}))?)$/;

/** The model's output is untrusted: only these exact shapes are ever acted on. */
export function safeAction(a: any): Action | null {
  if (!a || typeof a !== "object") return null;
  if (a.kind === "scroll" && typeof a.id === "string" && (SECTIONS as readonly string[]).includes(a.id)) return { kind: "scroll", id: a.id };
  if (a.kind === "route" && typeof a.to === "string" && ROUTE_OK.test(a.to)) return { kind: "route", to: a.to };
  return null;
}

export function runAction(a: Action) {
  if (a.kind === "scroll") {
    const el = document.getElementById(a.id);
    if (el) el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    else if (a.id === "top") window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    location.hash = a.to;
  }
}
