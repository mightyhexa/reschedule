import { AnimatePresence, motion, useAnimationControls, useReducedMotion, useSpring } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../app/api";
import { useHashPath } from "../app/router";
import { VoiceButton } from "../app/Voice";
import { ambientLine, useBench } from "./ambient";
import { errorLine, streamChat } from "./chatClient";
import type { ChatTurn } from "./chatClient";
import { Duck } from "./Duck";
import type { Costume, Mood } from "./types";
import { SECTIONS, costumeFor, isCostume, isMood, runAction, safeAction } from "./types";

/* ------------------------------------------------------------------ tiny persistence helpers (storage can be blocked) */
const ss = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private window */
    }
  },
};

interface Msg {
  id: number;
  role: "user" | "model";
  text: string;
  error?: boolean;
  cards?: any[];
}

const CHIPS_PUBLIC = ["Why not a full re-solve?", "Tell me a shop joke", "What does the pilot cost?", "Take me to sign in"];
const CHIPS_PORTAL = ["Any drafts waiting?", "Report a breakdown", "How do I upload job cards?", "Explain the stability slider"];

/* ------------------------------------------------------------------ hooks */
function useLook(ref: React.RefObject<HTMLElement>) {
  const x = useSpring(0, { stiffness: 140, damping: 18 });
  const y = useSpring(0, { stiffness: 140, damping: 18 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.4);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260) * 3.6;
      x.set((dx / d) * k);
      y.set((dy / d) * k * 0.8);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [ref, x, y]);
  return { x, y };
}

/** Which landing section crosses the middle of the screen, or which portal page we are on. */
function useWhere(path: string): string {
  const inApp = path === "/app" || path.startsWith("/app/");
  const [sec, setSec] = useState("top");
  useEffect(() => {
    if (inApp || path === "/login" || path === "/signup" || path === "/forgot") return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setSec((e.target as HTMLElement).id)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    const attach = () => SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    attach();
    const t = window.setTimeout(attach, 1500); // sections that mount late
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [inApp, path]);
  if (inApp) return path.startsWith("/app/review") ? "/app/review" : path === "/app" ? "/app/plan" : path.split("/").slice(0, 3).join("/");
  return sec;
}

function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    const evs = ["pointermove", "keydown", "scroll", "pointerdown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      evs.forEach((e) => window.removeEventListener(e, wake));
      window.clearTimeout(t);
    };
  }, [ms]);
  return idle;
}

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/* ------------------------------------------------------------------ the disruption confirmation card */
function ResultCard({ card }: { card: any }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  async function approve() {
    setState("busy");
    setErr("");
    try {
      await api(`/schedules/${card.id}/approve`, { method: "POST", body: {} });
      setState("done");
      window.dispatchEvent(new CustomEvent("duckmama", { detail: "approved" }));
      location.hash = "#/app";
    } catch (e: any) {
      setErr(e?.message ?? "Could not approve");
      setState("error");
    }
  }
  return (
    <div className="mt-2 rounded-2xl border border-line border-l-4 border-l-sage bg-cream/70 p-3">
      <div className="text-[12.5px] font-medium text-soft">Draft v{card.version} is ready</div>
      <div className="mt-1 text-[13.5px] font-medium text-ink">{card.summary}</div>
      <div className="mt-2 text-[12.5px] text-soft">
        {card.on_time_pct != null ? `${card.on_time_pct}% on time` : ""} · {card.moved} job step{card.moved === 1 ? "" : "s"} would move{card.late_jobs ? ` · ${card.late_jobs} late` : ""}
      </div>
      {(card.notes ?? []).map((n: string) => <div key={n} className="mt-1 text-[12px] text-ink">{n}</div>)}
      {state === "done" ? (
        <div className="mt-3 text-[13px] text-ink">Published. This is the live plan now.</div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => (location.hash = `#/app/review/${card.id}`)} className="rounded-full bg-terra px-4 py-2 text-[12.5px] font-medium text-ivory">Open &amp; Approve Repair →</button>
          <button onClick={approve} disabled={state === "busy"} className="rounded-full border border-ink/20 bg-ivory px-4 py-2 text-[12.5px] font-medium text-ink disabled:opacity-60">{state === "busy" ? "Publishing…" : "Approve & publish now"}</button>
        </div>
      )}
      {state === "error" && <div className="mt-2 text-[12.5px] text-brick">{err}</div>}
    </div>
  );
}

function DisruptionCard({ card, onRan }: { card: any; onRan: (ok: boolean) => void }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [out, setOut] = useState<{ id: string; version: number; moved: number; pct: number } | null>(null);
  const [err, setErr] = useState("");
  const ev = card.event ?? {};
  const chips: [string, string][] = [["What", String(ev.type ?? "").replace(/_/g, " ").replace(/^./, (c: string) => c.toUpperCase())]];
  if (ev.machine) chips.push(["Machine", ev.machine]);
  if (ev.job_id) chips.push(["Job", ev.job_id]);
  if (ev.avoid_machine) chips.push(["Keep off", ev.avoid_machine]);
  if (ev.second_job_id) chips.push(["Then", ev.second_job_id]);
  if (ev.other_job_id) chips.push(["With", ev.other_job_id]);
  if (ev.direction) chips.push(["How", ev.direction]);
  if (ev.reason) chips.push(["Why", ev.reason]);
  const mins = ev.duration_min ?? ev.delay_min ?? ev.extra_min;
  if (mins) chips.push(["Minutes", String(mins)]);

  async function run() {
    setState("running");
    setErr("");
    try {
      const s: any = await api("/events", { method: "POST", body: { event: ev, raw_text: card.raw_text, time_limit: 2, freeze_min: ["gap", "reorder", "move_machine"].includes(ev.type) ? 0 : 60 } });
      setOut({ id: s.id, version: s.version, moved: s.metrics?.moved_ops ?? 0, pct: s.metrics?.moved_pct ?? 0 });
      setState("done");
      onRan(true);
    } catch (e: any) {
      setErr(e?.message ?? "Could not run the repair");
      setState("error");
      onRan(false);
    }
  }
  return (
    <div className="mt-2 rounded-2xl border border-line border-l-4 border-l-terra bg-cream/70 p-3">
      <div className="text-[12.5px] font-medium text-soft">Check before I run it</div>
      <div className="mt-1 text-[13.5px] font-medium text-ink">{card.summary}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map(([k, v]) => (
          <span key={k} className="rounded-full border border-line bg-ivory px-2.5 py-0.5 font-mono text-[10.5px] text-soft">
            {k}: <b className="text-ink">{v}</b>
          </span>
        ))}
      </div>
      {state === "done" && out ? (
        <div className="mt-3 text-[13px] text-ink">
          Draft v{out.version} is ready. {out.moved} operation{out.moved === 1 ? "" : "s"} would move ({out.pct}%). It waits for approval.
          <button onClick={() => (location.hash = `#/app/review/${out.id}`)} className="mt-2 block rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-ivory">
            Open &amp; Approve Repair →
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={run}
            disabled={state === "running"}
            className="mt-3 rounded-full bg-terra px-4 py-2 text-[12.5px] font-medium text-ivory shadow-[0_6px_14px_-8px_rgba(200,100,59,0.9)] transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
          >
            {state === "running" ? "Solving…" : "Run 2s repair"}
          </button>
          {state === "error" && <div className="mt-2 text-[12.5px] text-brick">{err}</div>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ reflexes: she reacts before the model has said a word */
function reflexFor(t: string): { mood?: Mood; costume?: Costume } {
  if (/\b(down|broke|broken|breakdown|overheat\w*|stuck|jam\w*|urgent|rush\w*|late|delay\w*|emergency)\b/i.test(t)) return { mood: "panic", costume: "medic" };
  if (/\b(joke|funny|haha+|lol|mazak|hasa\w*)\b/i.test(t)) return { mood: "laughing" };
  if (/\b(stress\w*|tension|worried|scared|help)\b/i.test(t)) return { mood: "empathetic" };
  return {};
}

function Bubble({ children, tail, error }: { children: React.ReactNode; tail?: boolean; error?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`relative max-w-[94%] self-end rounded-[26px] border-2 px-4 py-3 text-[14px] leading-relaxed shadow-[0_14px_30px_-18px_rgba(43,33,24,0.55),inset_0_2px_0_rgba(255,255,255,0.95)] ${error ? "border-brick/30 bg-[#FFF3EF] text-brick" : "border-[#E6D8BF] bg-[#FFFBF3] text-ink"}`}
    >
      {children}
      {tail && <span className={`absolute -bottom-[9px] right-9 h-4 w-4 rotate-45 border-b-2 border-r-2 ${error ? "border-brick/30 bg-[#FFF3EF]" : "border-[#E6D8BF] bg-[#FFFBF3]"}`} />}
    </motion.div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: -12, rotate: -4 }} animate={{ opacity: 1, x: 0, rotate: -1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="relative max-w-[82%] self-start rounded-xl bg-[#FFF1BF] px-3.5 py-2 text-[13.5px] text-ink shadow-[0_8px_18px_-12px_rgba(43,33,24,0.55)]">
      <span className="absolute -top-1.5 left-5 h-3 w-9 -rotate-[4deg] rounded-sm bg-amber/45" />
      <span className="whitespace-pre-wrap break-words">{children}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ the assistant */
export function DuckMama() {
  const path = useHashPath();
  const reduce = !!useReducedMotion();
  const mobile = useMedia("(max-width: 639px)");
  const where = useWhere(path);
  const bench = useBench();
  const idle = useIdle(20000);
  const authScreen = path === "/login" || path === "/signup" || path === "/forgot";
  const inApp = path === "/app" || path.startsWith("/app/");

  const stageRef = useRef<HTMLDivElement>(null);
  const look = useLook(stageRef);
  const pop = useAnimationControls();

  const [status, setStatus] = useState({ enabled: true, signed_in: false });
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => ss.get("dm_hidden") === "1");
  const [temp, setTemp] = useState<Costume | null>(null);
  const [replyMood, setReplyMood] = useState<Mood | null>(null);
  const [flash, setFlash] = useState<Mood | null>(null);
  const [stampTick, setStampTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(ss.get("dm_msgs") ?? "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; k: number } | null>(null);

  const idRef = useRef(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const talkTimer = useRef<number>();
  const moodTimer = useRef<number>();
  const bubbleTimer = useRef<number>();
  const lastBubble = useRef(0);
  const shown = useRef<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const logInner = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---- who am I talking to (public visitor or signed-in user) */
  const refreshStatus = useCallback(async () => {
    try {
      const r = await api<{ enabled: boolean; signed_in: boolean }>("/assistant/status");
      setStatus(r);
      return r;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    refreshStatus();
  }, [path, refreshStatus]);

  /* ---- costume: always automatic. The page decides, the model or a reflex can override until the page changes */
  useEffect(() => setTemp(null), [where]);
  const costume: Costume = temp ?? costumeFor(where);

  /* ---- mood: always automatic. A stack of reasons, strongest first */
  const mood: Mood = flash ?? (idle && !busy ? "sleepy" : replyMood ?? (focused && input.trim() ? "listening" : "calm"));

  const showFlash = (m: Mood, ms: number) => {
    setFlash(m);
    window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setFlash(null), ms);
  };

  const squash = useCallback(() => {
    if (reduce) return;
    pop.start({ scaleY: [1, 0.86, 1.09, 1], scaleX: [1, 1.1, 0.95, 1], y: [0, 0, -8, 0], transition: { duration: 0.55, ease: "easeOut" } });
  }, [pop, reduce]);
  const prevMood = useRef<Mood>("calm");
  useEffect(() => {
    if (prevMood.current !== mood && (mood !== "calm" || prevMood.current === "sleepy")) squash();
    prevMood.current = mood;
  }, [mood, squash]);
  useEffect(() => squash(), [costume]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- say something small without the chat open */
  const say = useCallback((text: string, ms = 6500) => {
    setBubble({ text, k: Date.now() });
    lastBubble.current = Date.now();
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  useEffect(() => {
    if (open || hidden || authScreen) return;
    if (shown.current.has(where) || Date.now() - lastBubble.current < 18000) return;
    const line = ambientLine(where, bench);
    if (!line) return;
    const t = window.setTimeout(() => {
      shown.current.add(where);
      say(line);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [where, open, hidden, authScreen, bench, say]);

  // first hello (public) and a real status line for signed-in users: neither needs a model call
  useEffect(() => {
    if (authScreen || hidden || open) return;
    if (!inApp && ss.get("dm_hello") !== "1") {
      const t = window.setTimeout(() => {
        ss.set("dm_hello", "1");
        say("Quack. I'm DuckMama. Ask me anything, or tell me a machine broke.", 7500);
      }, 5200);
      return () => window.clearTimeout(t);
    }
    if (inApp && status.signed_in && ss.get("dm_welcome") !== "1") {
      ss.set("dm_welcome", "1");
      api<any>("/shop")
        .then((s) => {
          const d = s.pending ? `, and ${s.pending} draft${s.pending === 1 ? " is" : "s are"} waiting for approval` : "";
          say(`Welcome back. ${s.jobs} job${s.jobs === 1 ? "" : "s"} on ${s.machines} machine${s.machines === 1 ? "" : "s"}${d}.`, 8000);
        })
        .catch(() => {});
    }
  }, [inApp, status.signed_in, authScreen, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- signals from the pages */
  useEffect(() => {
    const on = (e: Event) => {
      const name = (e as CustomEvent).detail;
      if (name === "approved") {
        setStampTick((n) => n + 1);
        showFlash("approved", 3200);
        say("Stamped. That plan is live.", 4500);
      } else if (name === "disruption") {
        showFlash("surgical", 3000);
        say("Got it. Draft is ready for a manager.", 4500);
      }
    };
    window.addEventListener("duckmama", on);
    return () => window.removeEventListener("duckmama", on);
  }, [say]);

  /* ---- chat plumbing */
  useEffect(() => {
    ss.set("dm_msgs", JSON.stringify(msgs.slice(-24).map((m) => ({ ...m, cards: undefined }))));
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [msgs, reduce]);

  // keep the newest line in view as cards and streamed text grow, unless the reader scrolled up
  useEffect(() => {
    const el = logRef.current, inner = logInner.current;
    if (!open || !el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight });
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const toggle = (v: boolean) => {
    setOpen(v);
    setBubble(null);
    squash();
    if (v) window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
  };

  async function send(raw: string) {
    const text = raw.trim().slice(0, 1500);
    if (!text || busy) return;
    setInput("");
    setBubble(null);
    setOpen(true);
    const rf = reflexFor(text);
    if (rf.costume) setTemp(rf.costume);
    // a fresh session cookie is needed for the signed-in tools; refreshing is silent
    if (inApp && !status.signed_in) {
      await api("/shop").catch(() => {});
      await refreshStatus();
    }
    const mid = ++idRef.current;
    const history: ChatTurn[] = [
      ...msgs.filter((m) => !m.error && m.text.trim()).map((m) => ({ role: m.role, text: m.text.slice(0, 1500) })),
      { role: "user" as const, text },
    ].slice(-12);
    while (history.length > 1 && history[0].role !== "user") history.shift();
    setMsgs((m) => [...m, { id: mid, role: "user", text }, { id: mid + 1, role: "model", text: "" }]);
    idRef.current = mid + 1;
    const replyId = mid + 1;
    setBusy(true);
    setThinking(true);
    setReplyMood(rf.mood ?? null);
    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m) => (m.id === replyId ? fn(m) : m)));
    const finish = () => {
      setBusy(false);
      setThinking(false);
      window.clearTimeout(talkTimer.current);
      talkTimer.current = window.setTimeout(() => setTalking(false), 500);
      window.clearTimeout(moodTimer.current);
      moodTimer.current = window.setTimeout(() => setReplyMood(null), 14000);
    };
    await streamChat(
      { messages: history, page: location.hash || "#top" },
      {
        onMeta: (m) => {
          if (isMood(m.mood)) setReplyMood(m.mood);
          if (isCostume(m.costume)) setTemp(m.costume);
          const a = safeAction(m.action);
          if (a) window.setTimeout(() => runAction(a), 650);
        },
        onDelta: (t) => {
          setThinking(false);
          setTalking(true);
          window.clearTimeout(talkTimer.current);
          talkTimer.current = window.setTimeout(() => setTalking(false), 700);
          patch((m) => ({ ...m, text: m.text + t }));
        },
        onCard: (c) => patch((m) => ({ ...m, cards: [...(m.cards ?? []), c] })),
        onAction: (a) => {
          const act = safeAction(a);
          if (act) window.setTimeout(() => runAction(act), 650);
        },
        onDone: finish,
        onError: (code, detail) => {
          const line = errorLine(code) + (detail ? `\n\n(${detail})` : "");
          patch((m) => ({ ...m, text: m.text ? m.text + "\n\n" + line : line, error: !m.text }));
          setReplyMood("empathetic");
          finish();
        },
      },
      ac.signal
    );
    if (abortRef.current === ac) finish();
  }

  const stripTag = (s: string) => s.replace(/^\s*<<[^>]*>>\s*/, "");
  const chips = status.signed_in ? CHIPS_PORTAL : CHIPS_PUBLIC;
  const lastModelId = [...msgs].reverse().find((m) => m.role === "model")?.id;

  if (authScreen) return null;

  if (hidden)
    return (
      <button
        onClick={() => {
          setHidden(false);
          ss.set("dm_hidden", "0");
        }}
        aria-label="Bring DuckMama back"
        className="fixed bottom-3 right-3 z-[45] rounded-full border border-line bg-amber px-4 py-2 font-mono text-[11px] font-medium text-ink shadow-card transition-transform hover:-translate-y-0.5"
      >
        🦆 Mama
      </button>
    );

  return (
    <div
      style={{ bottom: where === "/app/review" ? (mobile ? 196 : 112) : mobile ? 8 : 12 }} /* clear of the sticky Approve bar */
      className={`pointer-events-none fixed right-2 z-[45] flex flex-col items-end gap-2 transition-[bottom] duration-300 sm:right-3 ${open ? "w-[min(380px,calc(100vw-16px))]" : ""}`}
      data-chrome-ignore
    >
      {/* thought bubble (closed state) */}
      <AnimatePresence>
        {bubble && !open && (
          <motion.button
            key={bubble.k}
            onClick={() => toggle(true)}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="pointer-events-auto relative mr-1 max-w-[240px] rounded-[22px] border-2 border-[#E6D8BF] bg-ivory px-4 py-2.5 text-left text-[13px] leading-snug text-ink shadow-lift"
          >
            {bubble.text}
            <span className="absolute -bottom-[9px] right-10 h-4 w-4 rotate-45 border-b-2 border-r-2 border-[#E6D8BF] bg-ivory" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* the conversation: her speech bubbles and your paper notes */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: "spring", stiffness: 280, damping: 26 }} className="pointer-events-auto relative w-full" role="dialog" aria-label="Chat with DuckMama">
            <div className="absolute right-0 top-0 z-10 flex gap-1.5">
              <button onClick={() => toggle(false)} aria-label="Minimise chat" className="grid h-7 w-7 place-items-center rounded-full border border-line bg-ivory text-[14px] leading-none text-soft shadow-card transition-transform hover:scale-110">
                –
              </button>
              <button
                onClick={() => {
                  setHidden(true);
                  ss.set("dm_hidden", "1");
                }}
                aria-label="Send Mama off for a chai break"
                title="Chai break"
                className="grid h-7 w-7 place-items-center rounded-full border border-line bg-ivory text-[13px] leading-none text-soft shadow-card transition-transform hover:scale-110"
              >
                ×
              </button>
            </div>
            <div ref={logRef} data-lenis-prevent role="log" aria-live="polite" className="max-h-[min(46vh,430px)] overflow-y-auto overscroll-contain px-1 pb-7 pt-9 [mask-image:linear-gradient(to_bottom,transparent,black_30px)]">
              <div ref={logInner} className="flex flex-col gap-3 pb-3 pt-1">
                {msgs.length === 0 && (
                  <Bubble tail>
                    {status.signed_in ? "Tell me what broke, or ask what's waiting on your floor. I only read your shop, nobody else's." : "I'm DuckMama. I know how ReSchedule repairs a plan without shuffling the whole floor. Ask me anything."}
                  </Bubble>
                )}
                {msgs.map((m) => {
                  const t = stripTag(m.text);
                  if (m.role === "user") return <Note key={m.id}>{m.text}</Note>;
                  return (
                    <Bubble key={m.id} tail={m.id === lastModelId} error={m.error}>
                      <span className="whitespace-pre-wrap break-words">{t || (busy && m.id === lastModelId ? <Dots /> : null)}</span>
                      {m.cards?.map((c, i) => (c.kind === "disruption" ? <DisruptionCard key={i} card={c} onRan={(ok) => ok && showFlash("surgical", 2600)} /> : c.kind === "result" ? <ResultCard key={i} card={c} /> : null))}
                    </Bubble>
                  );
                })}
              </div>
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap justify-start gap-1.5 pb-2">
                {chips.map((c) => (
                  <button key={c} onClick={() => send(c)} className="rounded-full border border-ink/15 bg-ivory px-3 py-1.5 text-[12px] text-ink shadow-sm transition-all hover:-translate-y-0.5 hover:border-terra hover:bg-terra/5">
                    {c}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the stage: a small input pill and the duck on her pedestal */}
      <div ref={stageRef} className="pointer-events-auto flex w-full items-end justify-end gap-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className={`mb-4 flex items-center gap-1 rounded-full border border-line bg-ivory py-1 pl-3.5 pr-1 shadow-card transition-all duration-300 focus-within:border-terra focus-within:shadow-[0_0_0_3px_rgba(200,100,59,0.16)] ${open ? "flex-1" : "w-[200px]"}`}
        >
          <input
            ref={inputRef}
            value={input}
            maxLength={1500}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (!open) toggle(true);
            }}
            onBlur={() => setFocused(false)}
            placeholder={status.signed_in ? "Tell Mama what's up…" : "Ask Mama anything…"}
            aria-label="Message DuckMama"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] text-ink outline-none placeholder:text-soft/70"
          />
          {!busy && <VoiceButton compact onText={(t) => { setInput(""); send(t); }} onError={(m) => say(m)} />}
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-terra text-ivory transition-all hover:-translate-y-0.5 active:scale-90 disabled:opacity-35">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <motion.button
          onClick={() => toggle(!open)}
          animate={pop}
          whileTap={{ scale: 0.94 }}
          aria-label={open ? "Minimise DuckMama" : "Open DuckMama chat"}
          style={{ transformOrigin: "50% 100%" }}
          className={`${mobile ? "w-[66px]" : "w-[84px]"} shrink-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-terra`}
        >
          <Duck mood={mood} costume={costume} talking={talking} thinking={thinking} look={look} stampTick={stampTick} className="block h-auto w-full" />
        </motion.button>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="DuckMama is thinking">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-terra" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.14 }} />
      ))}
    </span>
  );
}
