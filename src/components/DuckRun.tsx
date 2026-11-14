import { useCallback, useEffect, useRef, useState } from "react";

type GS = "IDLE" | "PLAYING" | "GAME_OVER";
type Ob = { id: number; t: number; x: number; w: number; h: number; passed: boolean; hit: boolean };
type Pt = { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; col: string; g: number };

const T = 1400;
const OBS = [
  { n: "Late stock", w: 66, h: 68 }, { n: "M3 down", w: 76, h: 60 }, { n: "Rush order", w: 64, h: 62 },
  { n: "Power cut", w: 44, h: 94 }, { n: "Oil spill", w: 118, h: 30 }, { n: "Oven fault", w: 70, h: 72 },
  { n: "Quality hold", w: 72, h: 68 }, { n: "Staff absent", w: 58, h: 68 }, { n: "Cold chain", w: 66, h: 76 },
];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ZONES = [
  { n: "Factory yard", at: 0, night: 0, c: ["#F6EFE6", "#EFE0CC", "#E5CEB3", "#DCCFC0", "#C9B7A3", "#DEC5A8", "#FFFDF9", "#DDC9B2"] },
  { n: "Old town bakery lane", at: 150, night: 0.12, c: ["#F9E6C8", "#F6CC9E", "#EDAA7B", "#E3BE9E", "#C79879", "#D89F72", "#FFF1DD", "#E7B98F"] },
  { n: "Container port", at: 350, night: 0.45, c: ["#BDB9D8", "#E6B9B3", "#F1A98A", "#A79FBC", "#877E9E", "#7E7191", "#F3DCD9", "#B79DB0"] },
  { n: "Night shift city", at: 600, night: 1, c: ["#1C2145", "#37326A", "#6B4E7E", "#343C68", "#262B52", "#2D2649", "#5A5E92", "#2E3262"] },
].map((z) => ({ ...z, rgb: z.c.map(hex) }));
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const FAR = (() => { const r = rng(11); const a: number[][] = []; let x = 0; while (x < T) { const w = 70 + r() * 60; a.push([x, w, 90 + r() * 140]); x += w + r() * 8; } return a; })();
const STARS = Array.from({ length: 44 }, (_, i) => [((i * 97) % 100) / 100, ((i * 53) % 55) / 100, i]);
const pool = (sc: number) => [0, 1, 2, ...(sc >= 60 ? [3, 4] : []), ...(sc >= 150 ? [5, 6] : []), ...(sc >= 300 ? [7, 8] : [])];

export function DuckRun() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const secRef = useRef<HTMLElement | null>(null);
  const visRef = useRef(false);
  const timer = useRef<number>(0);
  const [gameState, setGameState] = useState<GS>("IDLE");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [showHelp, setShowHelp] = useState(false);
  const [lastHit, setLastHit] = useState("");
  const [banner, setBanner] = useState("");

  const st = useRef({
    status: "IDLE" as GS, score: 0, best: 0, lives: 3, speed: 350, belt: 0, gear: 0, spawn: 1.2, id: 0, hurt: 0, time: 0, zone: 0, night: 0,
    pal: ZONES[0].rgb.map((a) => [...a]), lm: [1, 0, 0, 0],
    chick: { x: 150, y: 0, vy: 0, ground: true, run: 0, coyote: 0, buf: 0, stum: 0, inv: 0 },
    obs: [] as Ob[], pts: [] as Pt[],
    clouds: [{ x: 180, y: 70, s: 1.05, v: 18 }, { x: 560, y: 112, s: 0.85, v: 14 }, { x: 920, y: 52, s: 1.25, v: 22 }, { x: 1250, y: 98, s: 0.95, v: 16 }],
  });

  const begin = useCallback((play: boolean) => {
    const s = st.current;
    Object.assign(s, { status: play ? "PLAYING" : "IDLE", score: 0, lives: 3, speed: 350, obs: [], pts: [], spawn: 0.9, zone: 0 });
    Object.assign(s.chick, { y: 0, vy: 0, ground: true, stum: 0, inv: 0, buf: 0 });
    if (!play) s.belt = 0;
    setScore(0); setLives(3); setLastHit(""); setGameState(play ? "PLAYING" : "IDLE");
  }, []);
  const startGame = useCallback(() => begin(true), [begin]);
  const resetGame = useCallback(() => begin(false), [begin]);
  const jump = useCallback(() => {
    const s = st.current;
    if (s.status !== "PLAYING") { startGame(); return; }
    s.chick.buf = 0.12;
  }, [startGame]);
  const cut = useCallback(() => { const c = st.current.chick; if (c.vy < -260) c.vy *= 0.52; }, []);

  useEffect(() => {
    try { const v = parseInt(localStorage.getItem("reschedule_best_score") || "0", 10); if (v > 0) { st.current.best = v; setBestScore(v); } } catch { /* ignore */ }
    const io = new IntersectionObserver(([e]) => { visRef.current = e.isIntersecting; }, { threshold: 0.3 });
    if (secRef.current) io.observe(secRef.current);
    const kd = (e: KeyboardEvent) => {
      if (!visRef.current) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); if (!e.repeat) jump(); }
      else if (e.code === "Enter" && st.current.status === "GAME_OVER") { e.preventDefault(); startGame(); }
    };
    const ku = (e: KeyboardEvent) => { if (visRef.current && (e.code === "Space" || e.code === "ArrowUp")) cut(); };
    window.addEventListener("keydown", kd, { passive: false }); window.addEventListener("keyup", ku);
    return () => { io.disconnect(); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [jump, cut, startGame]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    let raf = 0, last = performance.now(), W = 0, H = 0;
    const fit = () => { const d = Math.min(window.devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    const ro = new ResizeObserver(fit); ro.observe(cv); fit();
    const s = st.current;

    const P = (i: number, a = 1) => { const v = s.pal[i]; return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a})`; };
    const rr = (x: number, y: number, w: number, h: number, r: number | number[]) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    const vbox = (x: number, y: number, w: number, h: number, r: number, c0: string, c1: string) => {
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.28)"; rr(x + 3, y + 3, Math.max(0, w - 6), 4, 2); ctx.fill();
    };
    const txt = (t: string, x: number, y: number, font: string, col: string) => { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, x, y); };
    const pill = (t: string, cx: number, cy: number) => {
      ctx.font = "600 11px ui-monospace, Menlo, monospace";
      const w = ctx.measureText(t).width + 18;
      if (cx + w / 2 > W - 8) return;
      ctx.fillStyle = "rgba(60,40,20,.12)"; rr(cx - w / 2, cy - 9, w, 22, 11); ctx.fill();
      ctx.fillStyle = "#F7EFE4"; rr(cx - w / 2, cy - 11, w, 22, 11); ctx.fill();
      ctx.strokeStyle = "#DFCBB2"; ctx.lineWidth = 1; ctx.stroke();
      txt(t, cx, cy, "600 11px ui-monospace, Menlo, monospace", "#292524");
    };
    const puff = (x: number, y: number, n: number, col: string, vy: number, g: number) => {
      for (let i = 0; i < n && s.pts.length < 220; i++) s.pts.push({ x: x + (Math.random() - 0.5) * 6, y, vx: -30 + Math.random() * 40, vy: vy - Math.random() * 30, r: 4 + Math.random() * 3, grow: 14, life: 0, max: 0.8 + Math.random() * 0.5, col, g });
    };
    const spark = (x: number, y: number, n: number) => {
      const cols = ["#FFF3B0", "#F59E0B", "#FB923C", "#EF4444"];
      for (let i = 0; i < n && s.pts.length < 220; i++) {
        const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7, v = 90 + Math.random() * 190;
        s.pts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 2.5, grow: 0, life: 0, max: 0.28 + Math.random() * 0.25, col: cols[(Math.random() * 4) | 0], g: 650 });
      }
    };
    const dust = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) s.pts.push({ x: x + (Math.random() - 0.5) * 20, y: y - 2, vx: -60 - Math.random() * 80, vy: -20 - Math.random() * 50, r: 5 + Math.random() * 5, grow: 8, life: 0, max: 0.45 + Math.random() * 0.2, col: "#E5D3B3", g: 90 });
    };

    const city = (base: number) => {
      const off = s.belt * 0.12, n = s.night;
      ctx.beginPath();
      const wins: number[][] = [];
      for (let o = -(off % T); o < W; o += T) for (const b of FAR) {
        const x = o + b[0]; if (x > W || x + b[1] < 0) continue;
        ctx.fillStyle = P(3); ctx.fillRect(x, base - b[2], b[1], b[2] + 40);
        ctx.fillStyle = `rgba(0,0,0,${0.07 + 0.1 * n})`; ctx.fillRect(x + b[1] * 0.68, base - b[2], b[1] * 0.32, b[2] + 40);
        ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - n)})`; ctx.fillRect(x, base - b[2], b[1], 2);
        const cols = Math.floor((b[1] - 12) / 16), rows = Math.floor((b[2] - 14) / 20);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((c * 7 + r * 13 + (b[0] | 0)) % 5 < 2) wins.push([x + 8 + c * 16, base - b[2] + 10 + r * 20]);
      }
      ctx.beginPath(); for (const w of wins) ctx.rect(w[0], w[1], 8, 10);
      ctx.fillStyle = `rgba(255,226,150,${0.14 + 0.72 * n})`; ctx.fill();
    };
    const smoke = (x: number, y: number) => { for (let i = 0; i < 3; i++) { const t = (s.time * 0.3 + i / 3) % 1; ctx.fillStyle = `rgba(240,232,222,${(1 - t) * 0.5})`; ctx.beginPath(); ctx.arc(x + t * 30, y - t * 60, 8 + t * 14, 0, 7); ctx.fill(); } };
    const grid = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath(); for (let r = 0; r < Math.floor(h / 20); r++) for (let c = 0; c < Math.floor(w / 16); c++) if ((c * 5 + r * 11) % 4 < 2) ctx.rect(x + 6 + c * 16, y + 8 + r * 20, 8, 10);
      ctx.fillStyle = "rgba(255,214,120,.85)"; ctx.fill();
    };
    const landmarks = (b: number) => {
      const off = s.belt * 0.22;
      for (let j = 0; j < 4; j++) {
        if (s.lm[j] < 0.02) continue;
        ctx.globalAlpha = s.lm[j];
        for (let o = -(off % T); o < W; o += T) {
          ctx.fillStyle = P(4); ctx.strokeStyle = P(4); ctx.lineWidth = 2;
          if (j === 0) {
            ctx.fillRect(o + 300, b - 200, 22, 230); ctx.fillRect(o + 346, b - 160, 18, 190); ctx.fillRect(o + 230, b - 70, 220, 100);
            smoke(o + 311, b - 200); smoke(o + 355, b - 160);
            ctx.strokeRect(o + 820, b - 140, 10, 140); ctx.beginPath(); ctx.moveTo(o + 790, b - 138); ctx.lineTo(o + 940, b - 138); ctx.lineTo(o + 825, b - 168); ctx.closePath(); ctx.stroke();
          } else if (j === 1) {
            for (let i = 0; i < 6; i++) {
              const hx = o + 40 + i * 215, h = 60 + ((i * 37) % 30);
              ctx.fillStyle = P(4); ctx.fillRect(hx, b - h, 130, h + 30);
              ctx.beginPath(); ctx.moveTo(hx - 8, b - h); ctx.lineTo(hx + 65, b - h - 40); ctx.lineTo(hx + 138, b - h); ctx.fill();
              ctx.fillStyle = "rgba(255,205,120,.85)"; ctx.fillRect(hx + 22, b - h + 14, 16, 18); ctx.fillRect(hx + 90, b - h + 14, 16, 18);
            }
            ctx.fillStyle = P(4); ctx.fillRect(o + 1120, b - 190, 30, 220); smoke(o + 1135, b - 190);
          } else if (j === 2) {
            const cc = ["#B5533C", "#3E7C8C", "#D0A33A", "#6B8F5E"];
            for (let i = 0; i < 5; i++) for (let r = 0; r <= i % 3; r++) { ctx.fillStyle = cc[(i + r) % 4]; ctx.globalAlpha = s.lm[j] * 0.8; ctx.fillRect(o + 420 + i * 66, b - 26 - r * 26, 62, 24); }
            ctx.globalAlpha = s.lm[j]; ctx.fillStyle = P(4); ctx.fillRect(o + 90, b - 150, 8, 150); ctx.fillRect(o + 190, b - 150, 8, 150); ctx.fillRect(o + 60, b - 160, 210, 8);
            ctx.beginPath(); ctx.moveTo(o + 270, b - 160); ctx.lineTo(o + 340, b - 120); ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(o + 860, b); ctx.lineTo(o + 1260, b); ctx.lineTo(o + 1220, b - 34); ctx.lineTo(o + 900, b - 34); ctx.fill(); ctx.fillRect(o + 1100, b - 80, 60, 46);
          } else {
            [[150, 80, 250], [380, 70, 200], [700, 90, 290], [1010, 76, 230]].forEach(([x, w, h]) => {
              ctx.fillStyle = P(4); ctx.fillRect(o + x, b - h, w, h + 30); grid(o + x, b - h, w, h);
            });
            ctx.fillStyle = Math.sin(s.time * 3) > 0 ? "#EF4444" : "#7F1D1D"; ctx.beginPath(); ctx.arc(o + 745, b - 296, 3, 0, 7); ctx.fill();
            ctx.fillStyle = P(4); ctx.fillRect(o + 744, b - 296, 2, 8);
          }
        }
      }
      ctx.globalAlpha = 1;
    };
    const hill = (f: number, col: string, a: number, y0: number) => {
      const off = s.belt * f; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 24; x += 24) ctx.lineTo(x, y0 - a * (0.5 + 0.5 * Math.sin((x + off) / 170)) - a * 0.3 * Math.sin((x + off) / 65));
      ctx.lineTo(W + 24, H); ctx.fill();
    };
    const cloud = (cx: number, cy: number, sc: number) => {
      const pf = [[-38, 8, 24], [-12, -6, 32], [22, 0, 28], [48, 10, 21], [5, 12, 26]];
      ctx.fillStyle = P(7); for (const [x, y, r] of pf) { ctx.beginPath(); ctx.arc(cx + x * sc, cy + (y + 6) * sc, r * sc, 0, 7); ctx.fill(); }
      ctx.fillStyle = P(6); for (const [x, y, r] of pf) { ctx.beginPath(); ctx.arc(cx + x * sc - 2, cy + (y - 1) * sc, r * sc * 0.93, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(60,40,20,.10)"; ctx.beginPath(); ctx.ellipse(cx + 6 * sc, cy + 38 * sc, 64 * sc, 9 * sc, 0, 0, 7); ctx.fill();
    };

    const belt = (gy: number) => {
      const g = ctx.createLinearGradient(0, gy, 0, gy + 14); g.addColorStop(0, "#58585C"); g.addColorStop(1, "#2C2C30");
      ctx.fillStyle = g; ctx.fillRect(0, gy, W, 14);
      ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 2;
      for (let x = -(s.belt % 36); x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x + 12, gy); ctx.lineTo(x, gy + 14); ctx.stroke(); }
      ctx.fillStyle = "#1C1917"; ctx.fillRect(0, gy + 14, W, 7);
      ctx.save(); ctx.beginPath(); ctx.rect(0, gy + 14, W, 7); ctx.clip(); ctx.fillStyle = "#EAB308";
      for (let x = -(s.belt % 28) - 28; x < W + 28; x += 28) { ctx.beginPath(); ctx.moveTo(x, gy + 21); ctx.lineTo(x + 10, gy + 14); ctx.lineTo(x + 22, gy + 14); ctx.lineTo(x + 12, gy + 21); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = "#18181B"; ctx.fillRect(0, gy + 21, W, H - gy - 21);
      let i = 0;
      for (let rx = 34; rx < W + 30; rx += 58, i++) {
        const cog = i % 3 === 1; ctx.save(); ctx.translate(rx, gy + 42); ctx.rotate(s.gear * (cog ? -0.8 : 1));
        if (cog) { ctx.fillStyle = "#78553A"; ctx.beginPath(); for (let k = 0; k < 20; k++) { const r = k % 2 ? 15 : 20, a = (k * Math.PI) / 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
        else { const rg = ctx.createRadialGradient(-5, -5, 2, 0, 0, 18); rg.addColorStop(0, "#A1A1AA"); rg.addColorStop(1, "#27272A"); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill(); }
        ctx.fillStyle = "#18181B"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
        ctx.fillStyle = "#A1A1AA"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#3F3F46"; ctx.fillRect(-1.5, -4, 3, 8);
        ctx.restore();
      }
    };

    const obstacle = (o: Ob, b: number) => {
      const { x, w, h } = o, top = b - h;
      ctx.fillStyle = "rgba(20,15,10,.32)"; ctx.beginPath(); ctx.ellipse(x + w / 2, b + 2, w * 0.54, 5, 0, 0, 7); ctx.fill();
      switch (o.t) {
        case 0:
          ctx.fillStyle = "#18181B"; ctx.beginPath(); ctx.arc(x + 12, b - 5, 5.5, 0, 7); ctx.arc(x + w - 14, b - 5, 5.5, 0, 7); ctx.fill();
          vbox(x, top + 2, w - 4, h - 10, 9, "#FACC15", "#A16207");
          ctx.fillStyle = "rgba(113,63,18,.35)"; for (let r = x + 14; r < x + w - 16; r += 12) ctx.fillRect(r, top + 16, 5, h - 34);
          ctx.save(); ctx.translate(x + 4, top + 26); ctx.rotate(0.42); ctx.fillStyle = "#E7D5B8"; ctx.fillRect(-22, 0, 26, 13); ctx.fillStyle = "#44403C"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "left"; ctx.fillText("CARGO", -19, 8); ctx.restore(); break;
        case 1:
          vbox(x, top, w - 6, h, 6, "#C2271D", "#4B120D");
          ctx.fillStyle = "rgba(20,8,8,.65)"; ctx.fillRect(x + 8, top + 20, w - 22, 22);
          txt("M3 down", x + (w - 6) / 2, top + 31, "bold 11px ui-monospace, monospace", "#FCA5A5");
          ctx.fillStyle = "rgba(0,0,0,.35)"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 10, top + 8 + i * 3, w - 26, 1.5);
          ctx.fillStyle = "#27272A"; ctx.fillRect(x + 6, b - 6, 10, 6); ctx.fillRect(x + w - 20, b - 6, 10, 6); break;
        case 2:
          vbox(x, top + h * 0.42, w, h * 0.58, 4, "#C79A63", "#7A5530"); vbox(x + 8, top, w - 20, h * 0.46, 4, "#D7AC74", "#8A6238");
          ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(x + w / 2 - 5, top + h * 0.42, 10, h * 0.58);
          ctx.fillStyle = "#DC2626"; ctx.fillRect(x + w - 32, top + h * 0.56, 28, 14); txt("RUSH", x + w - 18, top + h * 0.56 + 7, "bold 8px sans-serif", "#fff"); break;
        case 3: {
          const cx = x + w / 2;
          ctx.fillStyle = "#44403C"; ctx.fillRect(cx - 4, top, 8, h); ctx.fillRect(x + 4, top + 8, w - 8, 5);
          ctx.fillStyle = "#E7E5E4"; ctx.beginPath(); ctx.arc(x + 8, top + 6, 3, 0, 7); ctx.arc(x + w - 8, top + 6, 3, 0, 7); ctx.fill();
          vbox(cx - 16, top + 22, 32, 38, 8, "#8B97A3", "#4A5560");
          if (Math.sin(s.time * 18) > -0.3) { const y = top + 41; ctx.fillStyle = "#FDE047"; ctx.beginPath(); ctx.moveTo(cx + 3, y - 13); ctx.lineTo(cx - 6, y + 2); ctx.lineTo(cx, y + 2); ctx.lineTo(cx - 3, y + 14); ctx.lineTo(cx + 7, y - 3); ctx.lineTo(cx + 1, y - 3); ctx.fill(); }
          ctx.fillStyle = "#292524"; ctx.fillRect(x + 6, b - 6, w - 12, 6); break;
        }
        case 4:
          ctx.fillStyle = "#17171C"; ctx.beginPath(); ctx.ellipse(x + w / 2, b - 5, w / 2, 7, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(110,120,200,.38)"; ctx.beginPath(); ctx.ellipse(x + w / 2 - 12, b - 7, w * 0.26, 3, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(230,140,90,.3)"; ctx.beginPath(); ctx.ellipse(x + w / 2 + 18, b - 6, w * 0.16, 2.4, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#FACC15"; ctx.beginPath(); ctx.moveTo(x + 6, b - 2); ctx.lineTo(x + 30, b - 2); ctx.lineTo(x + 18, b - 30); ctx.fill();
          txt("!", x + 18, b - 11, "bold 12px sans-serif", "#1C1917"); break;
        case 5:
          ctx.fillStyle = "#6B747C"; ctx.fillRect(x + w - 24, top - 2, 10, 16);
          vbox(x, top + 10, w - 4, h - 10, 8, "#A7B0B8", "#4B535A");
          { const g = ctx.createLinearGradient(0, top + 26, 0, top + h - 16); g.addColorStop(0, "#FFC46B"); g.addColorStop(1, "#C2410C"); ctx.fillStyle = g; rr(x + 10, top + 28, w - 24, h - 44, [14, 14, 4, 4]); ctx.fill(); }
          ctx.strokeStyle = "rgba(60,20,5,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 12, top + 44); ctx.lineTo(x + w - 16, top + 44); ctx.moveTo(x + 12, top + 54); ctx.lineTo(x + w - 16, top + 54); ctx.stroke();
          ctx.fillStyle = "#2A2F34"; ctx.fillRect(x + 10, top + 22, w - 24, 3);
          ctx.fillStyle = Math.sin(s.time * 10) > 0 ? "#EF4444" : "#7F1D1D"; ctx.beginPath(); ctx.arc(x + 14, top + 17, 3, 0, 7); ctx.fill(); break;
        case 6:
          ctx.fillStyle = "#8B6B43"; ctx.fillRect(x, b - 10, w, 10); ctx.fillStyle = "#5C4528"; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * (w / 4) - 3, b - 8, 6, 6);
          vbox(x + 4, b - 40, 34, 30, 3, "#EBD6B0", "#B89463"); vbox(x + 36, b - 40, 30, 30, 3, "#E6CFA6", "#B08A5A"); vbox(x + 16, b - 68, 36, 28, 3, "#F0DDB9", "#BE9A68");
          ctx.strokeStyle = "#DC2626"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 4, b - 62); ctx.lineTo(x + w - 4, b - 18); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x + 4, b - 62); ctx.lineTo(x + w - 4, b - 18); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "#FEF2F2"; ctx.fillRect(x + w - 26, b - 56, 24, 12); txt("HOLD", x + w - 14, b - 50, "bold 8px sans-serif", "#B91C1C"); break;
        case 7:
          ctx.fillStyle = "#8B6B43"; ctx.fillRect(x + 2, top + 34, w - 24, 6); ctx.fillRect(x + 6, top + 40, 4, h - 40); ctx.fillRect(x + w - 30, top + 40, 4, h - 40);
          ctx.fillStyle = "#27272A"; ctx.fillRect(x + 8, top + 14, 22, 18); ctx.fillStyle = "#3B4048"; ctx.fillRect(x + 10, top + 16, 18, 13); ctx.fillRect(x + 17, top + 32, 4, 2);
          ctx.fillStyle = "#3F3F46"; ctx.fillRect(x + w - 22, top + 46, 18, 5); ctx.fillRect(x + w - 6, top + 22, 4, 28); ctx.fillRect(x + w - 15, top + 51, 3, h - 51);
          ctx.fillStyle = "#FEF3C7"; ctx.fillRect(x + w - 26, top, 22, 12); txt("OUT", x + w - 15, top + 6, "bold 8px sans-serif", "#92400E"); break;
        default:
          vbox(x, top, w - 4, h, 8, "#E4F4FF", "#7DB4D4");
          ctx.strokeStyle = "rgba(60,100,130,.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + (w - 4) / 2, top + 30); ctx.lineTo(x + (w - 4) / 2, b - 6); ctx.stroke();
          ctx.fillStyle = "#94A3B8"; ctx.fillRect(x + w - 18, top + 36, 4, 22);
          ctx.fillStyle = "#0F172A"; ctx.fillRect(x + 8, top + 10, 32, 16); txt("+9°C", x + 24, top + 18, "bold 10px ui-monospace, monospace", "#F87171");
          ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(x + 14, b - 14, 8, 0, 7); ctx.arc(x + 26, b - 8, 6, 0, 7); ctx.arc(x + w - 20, top + 66, 5, 0, 7); ctx.fill();
      }
      pill(OBS[o.t].n, x + w / 2, top - 18);
    };

    const chick = (gy: number) => {
      const c = s.chick, cy = gy + c.y - 27, over = s.status === "GAME_OVER";
      const sh = Math.max(0.35, 1 + c.y / 220);
      ctx.fillStyle = `rgba(30,20,10,${0.32 * sh})`; ctx.beginPath(); ctx.ellipse(c.x, gy + 1, 22 * sh, 5 * sh, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(c.x, cy);
      if (over) { ctx.rotate(0.9); ctx.translate(0, 6); } else if (c.stum > 0) ctx.rotate(Math.sin(c.stum * 35) * 0.25); else if (!c.ground) ctx.rotate(Math.max(-0.22, Math.min(0.22, c.vy * 0.00035)));
      if (c.inv > 0 && Math.floor(s.time * 16) % 2 === 0) ctx.globalAlpha = 0.5;
      for (const side of [-1, 1]) {
        const p = c.run + (side > 0 ? Math.PI : 0), sw = c.ground ? Math.sin(p) * 11 : side * 4, lift = c.ground ? Math.max(0, Math.cos(p)) * 6 : 7;
        const hx = side * 5, fx = hx + sw, fy = 26 - lift;
        ctx.strokeStyle = "#EA7A12"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(hx, 8); ctx.lineTo(hx + sw * 0.4, 17); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = "#EA7A12"; ctx.beginPath(); ctx.ellipse(fx + 4, fy, 8, 3, 0, 0, 7); ctx.fill();
      }
      const bg = ctx.createRadialGradient(-8, -12, 4, 0, -4, 24); bg.addColorStop(0, "#FDE047"); bg.addColorStop(0.55, "#F59E0B"); bg.addColorStop(1, "#B45309");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, -5, 21, 17, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -20, 15, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(-5, -6); ctx.rotate(c.ground ? Math.cos(c.run) * 0.15 : -0.45); ctx.fillStyle = "#E3A02B"; ctx.beginPath(); ctx.ellipse(-4, 3, 11, 7, -0.2, 0, 7); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#1C1917"; ctx.beginPath(); ctx.arc(10, -21, 2.8, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(11, -22, 1, 0, 7); ctx.fill();
      ctx.fillStyle = "#EA580C"; ctx.beginPath(); ctx.moveTo(16, -23); ctx.quadraticCurveTo(26, -20, 16, -16); ctx.fill();
      const hg = ctx.createRadialGradient(-2, -38, 2, 2, -30, 18); hg.addColorStop(0, "#F87171"); hg.addColorStop(0.55, "#DC2626"); hg.addColorStop(1, "#7F1D1D");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(3, -28, 15.5, Math.PI * 1.05, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#991B1B"; rr(-13, -30, 35, 4.5, 2.5); ctx.fill();
      ctx.restore();
      if (s.status === "IDLE") pill("Work-chick", c.x, gy + c.y - 84);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!W || !H || !visRef.current || document.hidden) return;
      const gy = H - 62, c = s.chick;
      s.time = now / 1000; c.x = Math.min(230, Math.max(90, W * 0.16));

      const zi = ZONES.reduce((a, z, i) => (s.score >= z.at ? i : a), 0);
      if (zi !== s.zone) {
        s.zone = zi;
        if (s.status === "PLAYING" && zi > 0) { setBanner(ZONES[zi].n); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setBanner(""), 3400); }
      }
      const k = Math.min(1, dt * 1.1);
      ZONES[zi].rgb.forEach((t, i) => t.forEach((v, ch) => { s.pal[i][ch] += (v - s.pal[i][ch]) * k; }));
      s.night += (ZONES[zi].night - s.night) * k;
      s.lm = s.lm.map((v, j) => v + ((j === zi ? 1 : 0) - v) * k);

      const spd = s.status === "PLAYING" ? s.speed : s.status === "IDLE" ? 150 : 0;
      s.belt += spd * dt; s.gear += (spd / 22) * dt;
      s.hurt = Math.max(0, s.hurt - dt); c.stum = Math.max(0, c.stum - dt); c.inv = Math.max(0, c.inv - dt);
      s.clouds.forEach((cl) => { cl.x -= (cl.v + spd * 0.04) * dt; if (cl.x < -130) cl.x = W + 130; });

      if (c.ground) { c.coyote = 0.085; c.run += spd * 0.05 * dt; } else c.coyote = Math.max(0, c.coyote - dt);
      if (c.buf > 0) {
        c.buf = Math.max(0, c.buf - dt);
        if (c.coyote > 0) { c.vy = -760; c.ground = false; c.coyote = 0; c.buf = 0; dust(c.x, gy, 5); }
      }
      if (!c.ground) {
        c.vy += (Math.abs(c.vy) < 95 ? 1150 : c.vy < 0 ? 1680 : 2450) * dt; c.y += c.vy * dt;
        if (c.y >= 0) { c.y = 0; c.vy = 0; c.ground = true; dust(c.x, gy, 7); }
      }

      if (s.status === "PLAYING") {
        s.score += dt * 13; s.speed = 350 + Math.min(280, s.score * 0.45);
        const r = Math.floor(s.score); setScore(r);
        if (r > s.best) { s.best = r; setBestScore(r); try { localStorage.setItem("reschedule_best_score", String(r)); } catch { /* ignore */ } }
        s.spawn -= dt;
        if (s.spawn <= 0) {
          const ids = pool(s.score), add = (t: number, x: number) => s.obs.push({ id: ++s.id, t, x, w: OBS[t].w, h: OBS[t].h, passed: false, hit: false });
          const t = ids[(Math.random() * ids.length) | 0]; add(t, W + 60);
          if (s.score > 200 && Math.random() < 0.3) add(ids[(Math.random() * ids.length) | 0], W + 60 + OBS[t].w + 200 + Math.random() * 60);
          s.spawn = Math.max(1.15, 2.35 - s.score * 0.0015) + Math.random() * 0.65 + (s.score > 200 ? 0.4 : 0);
        }
        for (const o of s.obs) {
          o.x -= s.speed * dt;
          if (o.t === 1 && Math.random() < 0.35) spark(o.x + 8, gy - o.h * 0.5, 1);
          if (o.t === 3 && Math.random() < 0.06) spark(o.x + o.w / 2, gy - o.h * 0.55, 3);
          if (o.t === 5 && Math.random() < 0.25) puff(o.x + o.w - 19, gy - o.h - 2, 1, "rgba(90,90,96,.55)", -50, -10);
          const oL = o.x + o.w * 0.16, oR = o.x + o.w * 0.84, oT = gy - (o.t === 4 ? 14 : o.h * 0.86);
          if (!o.hit && c.inv === 0 && c.x + 13 > oL && c.x - 13 < oR && gy + c.y - 3 > oT && gy + c.y - 48 < gy) {
            o.hit = true; s.lives--; s.hurt = 0.25; c.stum = 0.45; c.inv = 0.9; spark(c.x + 10, gy + c.y - 14, 14); setLives(s.lives);
            if (s.lives <= 0) { s.status = "GAME_OVER"; setLastHit(OBS[o.t].n); setGameState("GAME_OVER"); }
          }
          if (!o.passed && !o.hit && o.x + o.w < c.x - 10) { o.passed = true; if (o.t === 1) spark(o.x + o.w / 2, gy - o.h, 10); }
        }
        s.obs = s.obs.filter((o) => o.x > -160);
      }
      for (const p of s.pts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.r += p.grow * dt; }
      s.pts = s.pts.filter((p) => p.life < p.max);

      const sg = ctx.createLinearGradient(0, 0, 0, gy); sg.addColorStop(0, P(0)); sg.addColorStop(0.5, P(1)); sg.addColorStop(1, P(2));
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, gy + 2);
      if (s.night > 0.3) for (const [fx, fy, i] of STARS) { ctx.fillStyle = `rgba(255,250,230,${(s.night - 0.3) * (0.4 + 0.5 * Math.sin(s.time * 2 + i))})`; ctx.fillRect(fx * W, fy * gy, 2, 2); }
      if (s.night < 0.9) { const sx = W * 0.8, sy = gy * 0.34, g = ctx.createRadialGradient(sx, sy, 6, sx, sy, 110); g.addColorStop(0, `rgba(255,236,180,${0.7 * (1 - s.night)})`); g.addColorStop(1, "rgba(255,236,180,0)"); ctx.fillStyle = g; ctx.fillRect(sx - 120, sy - 120, 240, 240); ctx.fillStyle = `rgba(255,246,220,${1 - s.night})`; ctx.beginPath(); ctx.arc(sx, sy, 24, 0, 7); ctx.fill(); }
      if (s.night > 0.5) { ctx.fillStyle = `rgba(246,242,226,${s.night})`; ctx.beginPath(); ctx.arc(W * 0.14, gy * 0.3, 20, 0, 7); ctx.fill(); ctx.fillStyle = `rgba(0,0,0,${0.07 * s.night})`; ctx.beginPath(); ctx.arc(W * 0.14 + 6, gy * 0.3 - 4, 5, 0, 7); ctx.fill(); }
      s.clouds.forEach((cl) => cloud(cl.x, cl.y, cl.s));
      city(gy - 26); landmarks(gy - 26);
      const fog = ctx.createLinearGradient(0, gy - 120, 0, gy); fog.addColorStop(0, P(2, 0)); fog.addColorStop(1, P(2, 0.75)); ctx.fillStyle = fog; ctx.fillRect(0, gy - 120, W, 120);
      hill(0.3, P(5), 30, gy - 6); hill(0.45, P(4, 0.55), 22, gy + 8);
      const hx = 28 - s.belt;
      if (hx > -160) {
        ctx.fillStyle = "rgba(45,30,15,.25)"; ctx.beginPath(); ctx.ellipse(hx + 58, gy + 2, 66, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#8A5238"; ctx.fillRect(hx, gy - 62, 110, 62); ctx.fillStyle = "rgba(55,30,18,.3)"; for (let y = gy - 54; y < gy; y += 8) ctx.fillRect(hx, y, 110, 1);
        ctx.fillStyle = "#991B1B"; ctx.beginPath(); ctx.moveTo(hx - 8, gy - 60); ctx.lineTo(hx + 55, gy - 100); ctx.lineTo(hx + 118, gy - 60); ctx.fill();
        ctx.fillStyle = "#1E1612"; rr(hx + 78, gy - 38, 20, 38, 3); ctx.fill(); ctx.fillStyle = "#2A1F1A"; ctx.fillRect(hx + 14, gy - 44, 20, 18);
      }
      belt(gy);
      if (s.obs.length === 0 && s.status !== "PLAYING") {
        [[0, 0.44], [1, 0.63], [2, 0.84]].forEach(([t, f]) => obstacle({ id: -1, t, x: Math.min(f * W, W - 100), w: OBS[t].w, h: OBS[t].h, passed: false, hit: false }, gy));
      } else s.obs.forEach((o) => obstacle(o, gy));
      chick(gy);
      for (const p of s.pts) { ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (s.hurt > 0) { ctx.fillStyle = `rgba(220,38,38,${s.hurt * 0.35})`; ctx.fillRect(0, 0, W, H); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.clearTimeout(timer.current); };
  }, []);

  const prog = Math.min(200, score);
  const btn = "px-6 py-2.5 rounded-full bg-[#F8F2EA] border border-stone-300 text-stone-800 text-sm font-medium hover:bg-white transition cursor-pointer";
  const chip = "px-3.5 py-1.5 rounded-full bg-[#EFE2CE]/90 border border-[#DFCBB2]";
  return (
    <section id="play" ref={secRef} className="relative w-full select-none overflow-hidden bg-[#F6EFE6] pt-8 text-stone-900">
      <div className="relative z-20 mx-auto max-w-6xl px-6 pb-6 md:px-12">
        <h2 className="font-serif text-4xl font-bold tracking-tight md:text-6xl">Keep the line running.</h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-stone-700 md:text-lg">Every shop gets its own hurdles: a breakdown, a rush order, late stock, a power cut, a failed oven. Jump them and the conveyor keeps moving. Miss them all and the line stops.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="cursor-pointer rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-stone-50 shadow-sm transition hover:bg-stone-800 active:scale-95" onClick={(e) => { startGame(); e.currentTarget.blur(); }}>{gameState === "PLAYING" ? "Restart shift" : "Start playing"}</button>
          <button className={btn} onClick={(e) => { setShowHelp((p) => !p); e.currentTarget.blur(); }}>How to play</button>
          <button className={btn} onClick={(e) => { resetGame(); e.currentTarget.blur(); }}>Reset</button>
          {showHelp && <span className="rounded-full border border-stone-200/80 bg-white/80 px-4 py-2 text-xs text-stone-600">Space or tap to jump. Release early for a short hop. Reach 200 to clear the shift. Higher scores unlock new locations.</span>}
        </div>
      </div>
      <div className="relative h-[380px] w-full cursor-pointer md:h-[430px]" onPointerDown={jump} onPointerUp={cut}>
        <div className="pointer-events-none relative z-20 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pt-3 md:px-12">
          <span />
          <div className="flex items-center gap-2.5">
            <div className={`${chip} flex items-center gap-1.5 text-xs`} aria-label={`${lives} lives left`}>{[0, 1, 2].map((i) => <span key={i} className={i < lives ? "text-red-700" : "scale-90 text-stone-400/50"}>♥</span>)}</div>
            <div className={`${chip} flex items-center gap-2.5 font-mono text-xs font-semibold text-stone-800`}>
              <div className="h-2.5 w-24 overflow-hidden rounded-full bg-[#DFCBB2]"><div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-150" style={{ width: `${(prog / 200) * 100}%` }} /></div>
              <span>{prog}/200</span>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="rounded-full bg-stone-900 px-4 py-1.5 font-mono text-xs font-bold tracking-wider text-stone-100">SCORE {String(score).padStart(4, "0")}</div>
              <div className="rounded-full bg-[#B48228] px-3.5 py-1 font-mono text-[11px] font-bold tracking-wider text-amber-50">BEST {String(bestScore).padStart(4, "0")}</div>
            </div>
          </div>
        </div>
        <div className={`pointer-events-none absolute left-1/2 top-[76px] z-20 -translate-x-1/2 rounded-full bg-stone-900/85 px-4 py-1.5 font-mono text-[11px] tracking-wider text-stone-50 transition-opacity duration-500 ${banner ? "opacity-100" : "opacity-0"}`}>NEW LOCATION · {banner.toUpperCase()}</div>
        {gameState !== "PLAYING" && (
          <div className="pointer-events-none absolute inset-x-0 top-[116px] z-20 px-4 text-center" aria-live="polite">
            <p className={`font-serif text-4xl font-bold md:text-5xl ${gameState === "GAME_OVER" ? "text-[#992B1E]" : "text-stone-800"}`}>{gameState === "GAME_OVER" ? "Line stopped" : "Shift ready"}</p>
            <p className="mt-1.5 text-sm font-medium text-stone-800 md:text-base">{gameState === "GAME_OVER" && lastHit ? `Stopped by: ${lastHit}. ` : ""}Tap or press Space to {gameState === "GAME_OVER" ? "restart" : "start"}</p>
          </div>
        )}
        <canvas ref={canvasRef} className="absolute inset-0 z-10 block h-full w-full" style={{ maskImage: "linear-gradient(to bottom, transparent, #000 90px)", WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 90px)" }} />
      </div>
    </section>
  );
}

export default DuckRun;