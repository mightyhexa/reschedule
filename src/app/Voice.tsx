import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Push-to-talk. Uses the server's Whisper when it is set up, else the browser's own speech recognition.
 *  The words always land in the text box for the person to check; nothing is acted on from audio alone. */

const MAX_SECONDS = 30;
type Phase = "idle" | "listening" | "working";
type SR = any;

function browserSR(): SR | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

let serverFlag: Promise<boolean> | null = null;
const serverVoice = () => (serverFlag ??= api<{ server: boolean }>("/voice/config").then((r) => !!r.server).catch(() => false));

export function VoiceButton({ onText, hints = "", onError, className = "", compact = false }: {
  onText: (text: string) => void;
  hints?: string;
  onError?: (message: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [server, setServer] = useState<boolean | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const sr = useRef<SR | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    serverVoice().then((v) => alive.current && setServer(v));
    return () => {
      alive.current = false;
      stop(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canServer = server === true && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const canBrowser = !!browserSR();
  const supported = canServer || canBrowser;

  const clear = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const stop = useCallback((silent = false) => {
    clear();
    try { rec.current && rec.current.state !== "inactive" && rec.current.stop(); } catch { /* already stopped */ }
    try { sr.current?.stop?.(); } catch { /* already stopped */ }
    if (silent) { rec.current = null; sr.current = null; }
  }, []);

  const tick = () => {
    setSecs(0);
    timer.current = window.setInterval(() => setSecs((s) => {
      if (s + 1 >= MAX_SECONDS) stop();
      return s + 1;
    }), 1000);
  };

  async function startServer() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setPhase("idle");
      return onError?.("The microphone is blocked. Allow it in the address bar, then try again.");
    }
    chunks.current = [];
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = async () => {
      clear();
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      chunks.current = [];
      if (!alive.current) return;
      if (blob.size < 800) { setPhase("idle"); return onError?.("That was too short. Tap, speak, then tap again."); }
      setPhase("working");
      try {
        const form = new FormData();
        form.append("audio", blob, "note");
        form.append("hints", hints);
        const out = await api<{ text: string }>("/voice/transcribe", { form });
        if (alive.current) { setPhase("idle"); out.text ? onText(out.text) : onError?.("I did not catch any words. Try again."); }
      } catch (e: any) {
        if (!alive.current) return;
        setPhase("idle");
        const d = e?.detail;
        onError?.(typeof d === "object" && d?.message ? d.message : e?.message ?? "Voice failed. Type it instead.");
      }
    };
    r.start();
    setPhase("listening");
    tick();
  }

  function startBrowser() {
    const Ctor = browserSR();
    if (!Ctor) return;
    const r = new Ctor();
    sr.current = r;
    r.lang = navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN";
    r.interimResults = false;
    r.maxAlternatives = 1;
    let got = "";
    r.onresult = (e: any) => { got = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); };
    r.onerror = (e: any) => {
      clear();
      if (!alive.current) return;
      setPhase("idle");
      onError?.(e.error === "not-allowed" ? "The microphone is blocked. Allow it in the address bar, then try again." : e.error === "no-speech" ? "I did not hear anything. Try again." : "Voice is not available here. Type it instead.");
    };
    r.onend = () => {
      clear();
      if (!alive.current) return;
      setPhase("idle");
      if (got.trim()) onText(got.trim());
    };
    try { r.start(); setPhase("listening"); tick(); } catch { setPhase("idle"); }
  }

  function toggle() {
    if (phase === "listening") return stop();
    if (phase !== "idle") return;
    canServer ? startServer() : startBrowser();
  }

  if (server === null && !canBrowser) return null;
  if (!supported) return null;

  const listening = phase === "listening";
  if (compact) {
    return (
      <button type="button" onClick={toggle} disabled={phase === "working"} aria-pressed={listening}
        aria-label={listening ? "Stop recording" : "Speak to Mama"} title={listening ? `Listening ${secs}s, tap to stop` : "Speak"}
        className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 ${listening ? "bg-brick text-ivory" : "text-soft hover:bg-ink/5 hover:text-ink"} ${className}`}>
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-brick/30" aria-hidden="true" />}
        <svg viewBox="0 0 20 20" className="relative h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <rect x="7" y="2.5" width="6" height="10" rx="3" fill={listening ? "currentColor" : "none"} />
          <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
        </svg>
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} disabled={phase === "working"} aria-pressed={listening}
      aria-label={listening ? "Stop recording" : "Speak instead of typing"}
      className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${listening ? "border-brick bg-brick text-ivory" : "border-ink/20 text-ink hover:bg-ink/5"} ${className}`}>
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-brick/30" aria-hidden="true" />}
      <svg viewBox="0 0 20 20" className="relative h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <rect x="7" y="2.5" width="6" height="10" rx="3" fill={listening ? "currentColor" : "none"} />
        <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
      </svg>
      <span className="relative">{listening ? `Listening… ${secs}s, tap to stop` : phase === "working" ? "Writing it down…" : "Speak"}</span>
    </button>
  );
}
