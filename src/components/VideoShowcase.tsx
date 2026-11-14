import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  The opening: a workshop roller shutter that rises as you scroll,   */
/*  with the lit shop floor behind it. Drawn in canvas: corrugated     */
/*  slats with their own shading and wear, a coil housing that grows   */
/*  as the door rolls up, a rattle while it moves, and light spilling  */
/*  out under the bottom bar. Reduced motion gets the open door.       */
/* ------------------------------------------------------------------ */

const REEL_CHAPTERS = [
  { label: "Today's plan", time: 0, stamp: "0:00" },
  { label: "The breakdown", time: 6, stamp: "0:06" },
  { label: "Live repair", time: 16, stamp: "0:16" },
  { label: "Planner view", time: 30, stamp: "0:30" },
  { label: "Keep it running", time: 42, stamp: "0:42" },
] as const;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

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
  const smoothP = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.7 });

  const progressRef = useRef(0);
  const inViewRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(51);
  const [activeChapter, setActiveChapter] = useState(0);

  useMotionValueEvent(smoothP, "change", (v) => {
    progressRef.current = v;
  });

  const titleY = useTransform(smoothP, [0.1, 0.42, 0.66], [120, 0, -20]);
  const titleOpacity = useTransform(smoothP, [0.12, 0.34, 0.95], [0, 1, 1]);
  const playerY = useTransform(smoothP, [0.22, 0.55], [110, 0]);
  const playerScale = useTransform(smoothP, [0.22, 0.55], [0.94, 1]);
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
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let W = 0;
    let H = 0;
    let prevLift = 0;
    let vel = 0;
    let prevT = 0;

    const dust = Array.from({ length: 70 }, (_, i) => ({
      x: hash(i * 3.3),
      y: hash(i * 7.7),
      r: 0.6 + hash(i * 1.9) * 1.2,
      sp: 0.006 + hash(i * 5.1) * 0.014,
      ph: hash(i * 2.7) * 6.28,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    /* the lit shop floor behind the door */
    const drawInterior = (t: number, lift: number) => {
      ctx.save();
      const zoom = 1.1 - lift * 0.08; // the camera eases back as the door opens
      ctx.translate(W / 2, H * 0.62);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H * 0.62);

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0d0a08");
      sky.addColorStop(0.55, "#1b140e");
      sky.addColorStop(1, "#2a1d12");
      ctx.fillStyle = sky;
      ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);

      // back wall with panel seams
      const floorY = H * 0.72;
      ctx.fillStyle = "#211810";
      ctx.fillRect(0, H * 0.08, W, floorY - H * 0.08);
      ctx.strokeStyle = "rgba(255,225,180,0.045)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += W / 14) {
        ctx.beginPath();
        ctx.moveTo(x, H * 0.08);
        ctx.lineTo(x, floorY);
        ctx.stroke();
      }
      // floor
      const fl = ctx.createLinearGradient(0, floorY, 0, H);
      fl.addColorStop(0, "#33251a");
      fl.addColorStop(1, "#150f0a");
      ctx.fillStyle = fl;
      ctx.fillRect(0, floorY, W, H - floorY + 4);
      ctx.fillStyle = "rgba(255,225,180,0.06)";
      ctx.fillRect(0, floorY, W, 1.5);

      // machines, lit from above
      const mx = [0.14, 0.37, 0.63, 0.86];
      mx.forEach((f, i) => {
        const w = W * 0.17;
        const h = H * 0.27;
        const x = W * f - w / 2;
        const y = floorY - h;
        ctx.fillStyle = "#2b2520";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#38302a";
        ctx.fillRect(x, y, w, h * 0.09);
        ctx.fillStyle = "rgba(255,225,180,0.28)";
        ctx.fillRect(x, y, w, 1.5);
        const gw = w * 0.56;
        const gx = x + w * 0.1;
        const gy = y + h * 0.2;
        const gh = h * 0.5;
        const glass = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
        glass.addColorStop(0, "#1a2a2e");
        glass.addColorStop(0.45, "#2c4044");
        glass.addColorStop(0.5, "#1c2c30");
        glass.addColorStop(1, "#111c1f");
        ctx.fillStyle = glass;
        ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = "#1c1814";
        ctx.fillRect(x + w * 0.74, y + h * 0.2, w * 0.2, h * 0.34);
        const blink = (Math.sin(t * 2 + i * 1.7) + 1) / 2 > 0.4;
        ctx.fillStyle = blink ? "#E0A33A" : "#5b4520";
        ctx.fillRect(x + w * 0.8, y + h * 0.27, w * 0.07, w * 0.04);
        ctx.fillStyle = i % 2 ? "#6d8c5a" : "#3b4a33";
        ctx.fillRect(x + w * 0.8, y + h * 0.37, w * 0.07, w * 0.04);
        // faint reflection on the floor
        ctx.fillStyle = "rgba(255,225,180,0.035)";
        ctx.fillRect(x, floorY + 2, w, h * 0.16);
      });

      // pendant lamps: glow and a soft cone of light
      for (let i = 0; i < 5; i++) {
        const lx = W * (0.1 + i * 0.2);
        const len = H * (0.13 + (i % 2) * 0.04);
        const flick = 0.96 + 0.04 * Math.sin(t * 3 + i * 2.1);
        ctx.strokeStyle = "#0a0806";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, len);
        ctx.stroke();
        const cone = ctx.createLinearGradient(0, len, 0, floorY);
        cone.addColorStop(0, `rgba(255,214,150,${0.17 * flick})`);
        cone.addColorStop(1, "rgba(255,214,150,0)");
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(lx - 20, len + 8);
        ctx.lineTo(lx + 20, len + 8);
        ctx.lineTo(lx + W * 0.1, floorY);
        ctx.lineTo(lx - W * 0.1, floorY);
        ctx.closePath();
        ctx.fill();
        const glow = ctx.createRadialGradient(lx, len + 8, 2, lx, len + 8, H * 0.3);
        glow.addColorStop(0, `rgba(255,222,170,${0.5 * flick})`);
        glow.addColorStop(1, "rgba(255,222,170,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(lx - H * 0.3, len - H * 0.3, H * 0.6, H * 0.6);
        ctx.fillStyle = "#1b1612";
        ctx.beginPath();
        ctx.moveTo(lx - 22, len + 9);
        ctx.lineTo(lx - 8, len - 3);
        ctx.lineTo(lx + 8, len - 3);
        ctx.lineTo(lx + 22, len + 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(255,236,200,${0.9 * flick})`;
        ctx.fillRect(lx - 17, len + 8, 34, 2.5);
        // pool of light on the floor
        const pool = ctx.createRadialGradient(lx, floorY + (H - floorY) * 0.3, 2, lx, floorY + (H - floorY) * 0.3, W * 0.12);
        pool.addColorStop(0, `rgba(255,214,150,${0.2 * flick})`);
        pool.addColorStop(1, "rgba(255,214,150,0)");
        ctx.save();
        ctx.translate(0, floorY + (H - floorY) * 0.3);
        ctx.scale(1, 0.3);
        ctx.translate(0, -(floorY + (H - floorY) * 0.3));
        ctx.fillStyle = pool;
        ctx.fillRect(lx - W * 0.12, floorY - W * 0.05, W * 0.24, W * 0.5);
        ctx.restore();
      }

      // dust hanging in the light
      ctx.globalCompositeOperation = "lighter";
      for (const d of dust) {
        const y = (((d.y - t * d.sp) % 1) + 1) % 1;
        const x = d.x + Math.sin(t * 0.3 + d.ph) * 0.01;
        const a = 0.16 + 0.14 * Math.sin(t * 0.8 + d.ph);
        ctx.fillStyle = `rgba(255,232,190,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x * W, y * H * 0.9, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // keep the middle calm for the headline and the player
      const vig = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.2, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
      vig.addColorStop(0, "rgba(10,7,5,0.42)");
      vig.addColorStop(1, "rgba(10,7,5,0.78)");
      ctx.fillStyle = vig;
      ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
      ctx.restore();
    };

    /* corrugated slat, with ribs, wear and the light leaking from below */
    const drawSlat = (k: number, y0: number, y1: number, x0: number, x1: number, warm: number, shake: number) => {
      const sh = y1 - y0;
      const tone = 0.93 + hash(k * 3.1) * 0.1;
      const amb = mix(0.78, 1.02, clamp(y1 / H));
      const r = 128 * tone * amb;
      const g = 120 * tone * amb;
      const b = 110 * tone * amb;
      const c = (m: number, a = 1) =>
        `rgba(${Math.round(Math.min(255, r * m + warm * 90))},${Math.round(Math.min(255, g * m + warm * 46))},${Math.round(Math.min(255, b * m + warm * 8))},${a})`;
      const ox = shake * (hash(k + Math.floor(prevT * 40)) - 0.5);
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, c(1.2));
      gr.addColorStop(0.08, c(1.08));
      gr.addColorStop(0.5, c(0.97));
      gr.addColorStop(0.86, c(0.78));
      gr.addColorStop(1, c(0.5));
      ctx.fillStyle = gr;
      ctx.fillRect(x0 + ox, y0, x1 - x0, sh + 0.5);
      // rib
      ctx.fillStyle = "rgba(255,244,226,0.1)";
      ctx.fillRect(x0 + ox, y0 + sh * 0.5, x1 - x0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x0 + ox, y0 + sh * 0.5 + 1, x1 - x0, 1.5);
      // seam shadow between slats
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(x0 + ox, y1 - 1.5, x1 - x0, 1.5);
      // weathering streaks and scratches
      for (let s = 0; s < 3; s++) {
        const sx = x0 + hash(k * 17 + s * 5.3) * (x1 - x0);
        const sw = 24 + hash(k * 9 + s) * 70;
        const sg = ctx.createLinearGradient(sx, 0, sx + sw, 0);
        sg.addColorStop(0, "rgba(0,0,0,0)");
        sg.addColorStop(0.5, `rgba(20,12,6,${0.05 + hash(k + s * 3) * 0.06})`);
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(sx + ox, y0, sw, sh);
      }
      for (let s = 0; s < 34; s++) {
        const sx = x0 + hash(k * 91 + s * 7.3) * (x1 - x0);
        const sy = y0 + 2 + hash(k * 53 + s * 3.9) * (sh - 4);
        const len = 4 + hash(k * 31 + s * 1.7) * 30;
        const dark = hash(k * 13 + s * 2.2) > 0.4;
        ctx.fillStyle = dark ? `rgba(0,0,0,${0.06 + hash(s + k) * 0.1})` : "rgba(255,240,220,0.07)";
        ctx.fillRect(sx + ox, sy, len, 0.8);
      }
    };

    const drawDoor = (lift: number) => {
      const guide = Math.max(16, W * 0.014);
      const hood = 20 + lift * 38;
      const bar = 28;
      const yDoor = H + 8 - lift * (H + 8 + bar + 20); // bottom of the bar
      const yStack = yDoor - bar; // bottom of the last slat
      const x0 = guide;
      const x1 = W - guide;
      const sh = clamp(H / 19, 30, 48);
      const shake = clamp(vel * 5, 0, 2.6);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, hood, W, H);
      ctx.clip();
      for (let k = 0; yStack - (k + 1) * sh > hood - sh; k++) {
        const y1 = yStack - k * sh;
        const y0 = y1 - sh;
        const warm = lift > 0.002 ? clamp(1 - (yStack - y1) / (sh * 4)) * clamp(lift * 14) * 0.42 : 0;
        drawSlat(k, y0, y1, x0, x1, warm, shake);
      }
      // shadow of the hood across the top slats
      const hs = ctx.createLinearGradient(0, hood, 0, hood + 70);
      hs.addColorStop(0, "rgba(0,0,0,0.5)");
      hs.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hs;
      ctx.fillRect(0, hood, W, 70);
      ctx.restore();

      // bottom bar with the grip and locks
      if (yDoor > -bar) {
        const by = yDoor - bar;
        const bg = ctx.createLinearGradient(0, by, 0, yDoor);
        bg.addColorStop(0, "#b4aa9b");
        bg.addColorStop(0.18, "#8a8174");
        bg.addColorStop(0.7, "#625b51");
        bg.addColorStop(1, "#2c2822");
        ctx.fillStyle = bg;
        ctx.fillRect(x0, by + shake * 0.2, x1 - x0, bar);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x0, yDoor - 2, x1 - x0, 2);
        // recessed grip
        const gw = Math.min(150, W * 0.12);
        ctx.fillStyle = "#2a251f";
        ctx.fillRect(W / 2 - gw / 2, by + 8, gw, 10);
        ctx.fillStyle = "rgba(255,240,220,0.18)";
        ctx.fillRect(W / 2 - gw / 2, by + 18, gw, 1);
        // lock bolts
        for (const bx of [x0 + 26, x1 - 26]) {
          ctx.fillStyle = "#3b362f";
          ctx.beginPath();
          ctx.arc(bx, by + bar / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,240,220,0.3)";
          ctx.beginPath();
          ctx.arc(bx - 1, by + bar / 2 - 1.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        // light spilling from the gap lights the bar's lower edge and the floor in front of it
        if (lift > 0.002) {
          const a = clamp(lift * 12);
          const spill = ctx.createLinearGradient(0, yDoor, 0, yDoor + 90);
          spill.addColorStop(0, `rgba(255,205,130,${0.5 * a})`);
          spill.addColorStop(1, "rgba(255,205,130,0)");
          ctx.fillStyle = spill;
          ctx.fillRect(x0, yDoor, x1 - x0, 90);
          ctx.fillStyle = `rgba(255,214,150,${0.7 * a})`;
          ctx.fillRect(x0, yDoor - 1.5, x1 - x0, 1.5);
        }
      }

      // guide rails
      for (const gx of [0, W - guide]) {
        const rg = ctx.createLinearGradient(gx, 0, gx + guide, 0);
        rg.addColorStop(0, gx === 0 ? "#1b1814" : "#5d564c");
        rg.addColorStop(0.5, "#3a352e");
        rg.addColorStop(1, gx === 0 ? "#5d564c" : "#1b1814");
        ctx.fillStyle = rg;
        ctx.fillRect(gx, 0, guide, H);
        for (let y = 60; y < H; y += 96) {
          ctx.fillStyle = "#14110d";
          ctx.beginPath();
          ctx.arc(gx + guide / 2, y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,240,220,0.22)";
          ctx.beginPath();
          ctx.arc(gx + guide / 2 - 0.7, y - 0.8, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // coil housing: grows as more of the door rolls up into it
      const hg = ctx.createLinearGradient(0, 0, 0, hood);
      hg.addColorStop(0, "#26221c");
      hg.addColorStop(0.35, "#6a6358");
      hg.addColorStop(0.55, "#4a443b");
      hg.addColorStop(1, "#1b1814");
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, W, hood);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, hood - 2, W, 2);
      for (let x = 70; x < W; x += 170) {
        ctx.fillStyle = "rgba(255,240,220,0.2)";
        ctx.beginPath();
        ctx.arc(x, hood * 0.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!inViewRef.current || !W || !H) return;
      const t = now * 0.001;
      const dt = Math.min(0.05, Math.max(0.001, t - prevT));
      prevT = t;
      const p = progressRef.current;
      const lift = reduced ? 1 : easeInOut(clamp(p / 0.42));
      vel = mix(vel, Math.abs(lift - prevLift) / dt, 0.2);
      prevLift = lift;

      drawInterior(t, lift);
      if (lift < 0.999) drawDoor(lift);
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

          <motion.div style={{ y: playerY, scale: playerScale, opacity: playerOpacity }} className="gpu-layer mt-6 w-full max-w-[940px]">
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
