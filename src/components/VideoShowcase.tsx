import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ShutterScene } from "./shutterScene";

/* ------------------------------------------------------------------ */
/*  The opening: a roller shutter that rises as you scroll, with the  */
/*  lit shop behind it. The scene lives in shutterScene.ts. Reduced    */
/*  motion gets the open door.                                         */
/* ------------------------------------------------------------------ */

const REEL_CHAPTERS = [
  { label: "Today's plan", time: 0, stamp: "0:00" },
  { label: "The breakdown", time: 6, stamp: "0:06" },
  { label: "Live repair", time: 16, stamp: "0:16" },
  { label: "Planner view", time: 30, stamp: "0:30" },
  { label: "Keep it running", time: 42, stamp: "0:42" },
] as const;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}
function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      {on ? (
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M11 6l4 4m0-4l-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function VideoShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // a little mass in the spring, so the door has weight and does not follow the wheel one-to-one
  const smoothP = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.6 });

  const rawRef = useRef(0);
  const inViewRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(51);
  const [activeChapter, setActiveChapter] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    rawRef.current = v;
  });

  const titleY = useTransform(smoothP, [0.1, 0.42, 0.66], [120, 0, -20]);
  const titleOpacity = useTransform(smoothP, [0.12, 0.34, 0.95], [0, 1, 1]);
  const playerY = useTransform(smoothP, [0.22, 0.55], [110, 0]);
  const playerScale = useTransform(smoothP, [0.22, 0.55], [0.92, 1]);
  const playerTilt = useTransform(smoothP, [0.22, 0.55], [9, 0]);
  const playerOpacity = useTransform(smoothP, [0.22, 0.42], [0, 1]);

  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        const vid = videoRef.current;
        if (!vid) return;
        if (entry.isIntersecting) {
          vid.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          vid.pause();
          setIsPlaying(false);
        }
      },
      { threshold: 0.15 }
    );
    io.observe(sec);
    return () => io.disconnect();
  }, []);

  /* ---------------------------- the shutter ---------------------------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let scene: ShutterScene;
    try {
      scene = new ShutterScene(cv);
    } catch {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let prev = performance.now();
    let first = true;
    let ready = scene.resize();
    const ro = new ResizeObserver(() => {
      ready = scene.resize();
      first = true;
    });
    ro.observe(cv);
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!inViewRef.current || !ready) {
        prev = now;
        return;
      }
      const dt = (now - prev) / 1000;
      prev = now;
      const target = easeInOut(clamp(rawRef.current / 0.42));
      scene.frame(now, dt, target, first, reduced);
      first = false;
      if (import.meta.env.DEV) (window as unknown as { __shutterMs?: number }).__shutterMs = scene.ms;
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);


  /* ------------------------------ player ------------------------------ */
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };
  const watchWithSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setIsMuted(false);
    v.currentTime = 0;
    v.play();
    setIsPlaying(true);
  };
  const jumpToChapter = (idx: number, seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seconds;
    setActiveChapter(idx);
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    }
  };
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const ct = v.currentTime;
    setCurrentTime(ct);
    if (v.duration && !Number.isNaN(v.duration)) setDuration(v.duration);
    let chap = 0;
    for (let i = REEL_CHAPTERS.length - 1; i >= 0; i--) {
      if (ct >= REEL_CHAPTERS[i].time) {
        chap = i;
        break;
      }
    }
    if (chap !== activeChapter) setActiveChapter(chap);
  };
  const fmtTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const videoSrc = `${import.meta.env.BASE_URL}videos/reschedule-reel.mp4`;

  return (
    <section id="reel" ref={sectionRef} className="relative z-10 h-[260vh] select-none">
      <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0d0a08]">
        <canvas ref={canvasRef} aria-hidden="true" className="gpu-layer pointer-events-none absolute inset-0 h-full w-full" />

        <div className="relative z-20 mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-14 sm:px-6">
          <motion.div style={{ y: titleY, opacity: titleOpacity }} className="gpu-layer text-center">
            <p className="mb-3 text-[15px] text-[#E6DAC8]">The 50-second film</p>
            <h2 className="h-editorial text-[40px] text-[#FAF3E8] drop-shadow-[0_6px_28px_rgba(0,0,0,0.7)] sm:text-[60px] md:text-[74px]">
              Repair the plan.{" "}
              <em className="font-light italic text-[#E0A33A]">Don’t rebuild it.</em>
            </h2>
          </motion.div>

          <motion.div style={{ y: playerY, scale: playerScale, rotateX: playerTilt, opacity: playerOpacity, transformPerspective: 1200 }} className="gpu-layer mt-6 w-full max-w-[940px]">
            <div className="rounded-2xl border border-white/10 bg-[#120e0b]/95 p-2 shadow-[0_40px_90px_-24px_rgba(0,0,0,0.9)] sm:p-2.5">
              <div className="group relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  playsInline
                  loop
                  muted={isMuted}
                  onTimeUpdate={onTimeUpdate}
                  onClick={togglePlay}
                  className="h-full w-full cursor-pointer object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-12">
                  <div className="pointer-events-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pause video" : "Play video"}
                      className="grid h-9 w-9 place-items-center rounded-full bg-[#FAF3E8] text-[#211A14] transition-transform hover:scale-105"
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={isMuted ? "Turn sound on" : "Mute"}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-[#FAF3E8] transition-colors hover:bg-white/25"
                    >
                      <SoundIcon on={!isMuted} />
                    </button>
                    {isMuted && (
                      <button type="button" onClick={watchWithSound} className="ml-1 rounded-full bg-terra px-4 py-2 text-[13px] font-medium text-ivory transition-transform hover:scale-[1.03]">
                        Watch from the start with sound
                      </button>
                    )}
                  </div>
                  <span className="pointer-events-none pb-2 font-mono text-[12px] text-[#E6DAC8]">
                    {fmtTime(currentTime)} / {fmtTime(duration)}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                  <div className="h-full bg-terra transition-[width] duration-150" style={{ width: `${Math.min(100, (currentTime / (duration || 51)) * 100)}%` }} />
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1 px-1">
                {REEL_CHAPTERS.map((ch, i) => {
                  const active = i === activeChapter;
                  return (
                    <button
                      key={ch.label}
                      type="button"
                      onClick={() => jumpToChapter(i, ch.time)}
                      className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                        active ? "bg-[#FAF3E8] font-medium text-[#211A14]" : "text-[#D8C5B0]/80 hover:bg-white/[0.08] hover:text-[#FAF3E8]"
                      }`}
                    >
                      {ch.label} <span className={`ml-1 font-mono text-[11px] ${active ? "text-terra" : "opacity-60"}`}>{ch.stamp}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
