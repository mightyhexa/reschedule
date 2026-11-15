/* ------------------------------------------------------------------ */
/*  Roller shutter + shop floor, drawn in 2D canvas.                   */
/*                                                                     */
/*  Everything heavy (the shop, the slat textures) is painted once to  */
/*  off-screen layers when the size changes. A frame is then only a    */
/*  handful of drawImage calls plus the lights, so it stays smooth on  */
/*  phones. The door has real mass: a spring chases the scroll target, */
/*  slats lag in a wave while it moves, they foreshorten as they roll  */
/*  into the barrel, and the shop lights flicker on one by one as the  */
/*  gap grows.                                                         */
/* ------------------------------------------------------------------ */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Ctx = CanvasRenderingContext2D;
const SLAT_VARIANTS = 6;
const LAMPS = [0.12, 0.31, 0.5, 0.69, 0.88];

export class ShutterScene {
  private ctx: Ctx;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private back!: HTMLCanvasElement;
  private mid!: HTMLCanvasElement;
  private fg!: HTMLCanvasElement;
  private slats: HTMLCanvasElement[] = [];
  private glow!: HTMLCanvasElement;
  private towers: { x: number; y: number }[] = [];
  private dust: { x: number; y: number; r: number; sp: number; ph: number; dr: number }[] = [];
  private sh = 40;
  private guide = 16;
  private ground = 36;
  private floorY = 0;

  /** door position, 0 closed .. 1 fully rolled up, and its speed */
  lift = 0;
  speed = 0;
  ms = 0;

  constructor(private cv: HTMLCanvasElement) {
    const c = cv.getContext("2d", { alpha: false });
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
  }

  /* ----------------------------- sizing ----------------------------- */
  resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const W = this.cv.clientWidth;
    const H = this.cv.clientHeight;
    if (!W || !H) return false;
    if (W === this.W && H === this.H && dpr === this.dpr) return true;
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.sh = clamp(H / 17, 34, 54);
    this.guide = Math.max(14, W * 0.013);
    this.ground = Math.round(H * 0.05);
    this.floorY = Math.round(H * 0.7);
    const n = W < 600 ? 34 : 64;
    this.dust = Array.from({ length: n }, (_, i) => ({
      x: hash(i * 3.3), y: hash(i * 7.7), r: 0.6 + hash(i * 1.9) * 1.3,
      sp: 0.004 + hash(i * 5.1) * 0.012, ph: hash(i * 2.7) * 6.28, dr: (hash(i * 9.1) - 0.5) * 0.01,
    }));
    this.buildLayers();
    return true;
  }

  private layer(w = this.W, h = this.H): [HTMLCanvasElement, Ctx] {
    const c = document.createElement("canvas");
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const x = c.getContext("2d")!;
    x.scale(this.dpr, this.dpr);
    return [c, x];
  }

  private buildLayers() {
    this.buildBack();
    this.buildMid();
    this.buildFg();
    this.buildSlats();
    this.buildGlow();
  }

  /* ---------------------- back wall and ceiling ---------------------- */
  private buildBack() {
    const { W, H, floorY } = this;
    const [c, x] = this.layer();
    this.back = c;
    const wall = x.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, "#15100c");
    wall.addColorStop(0.45, "#241a12");
    wall.addColorStop(1, "#2c2016");
    x.fillStyle = wall;
    x.fillRect(0, 0, W, H);

    // corrugated wall panels
    x.lineWidth = 1;
    for (let i = 0; i <= 28; i++) {
      const px = (i / 28) * W;
      x.strokeStyle = i % 2 ? "rgba(255,225,180,0.03)" : "rgba(0,0,0,0.18)";
      x.beginPath(); x.moveTo(px, H * 0.2); x.lineTo(px, floorY); x.stroke();
    }
    // clerestory windows: cool morning light, a strong contrast to the warm lamps
    const wy = H * 0.09, wh = H * 0.13;
    for (let i = 0; i < 7; i++) {
      const wx = W * (0.05 + i * 0.135), ww = W * 0.1;
      const g = x.createLinearGradient(0, wy, 0, wy + wh);
      g.addColorStop(0, "rgba(170,205,230,0.85)");
      g.addColorStop(1, "rgba(110,150,185,0.55)");
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = "#17110c";
      x.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      x.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
      x.strokeStyle = "#0e0a07"; x.lineWidth = 3; x.strokeRect(wx, wy, ww, wh);
      const beam = x.createLinearGradient(0, wy + wh, 0, floorY);
      beam.addColorStop(0, "rgba(170,205,230,0.10)");
      beam.addColorStop(1, "rgba(170,205,230,0)");
      x.fillStyle = beam;
      x.beginPath();
      x.moveTo(wx, wy + wh); x.lineTo(wx + ww, wy + wh);
      x.lineTo(wx + ww + W * 0.07, floorY); x.lineTo(wx - W * 0.03, floorY);
      x.closePath(); x.fill();
    }
    // ceiling trusses and a pipe run
    x.strokeStyle = "rgba(8,6,4,0.9)"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, H * 0.035); x.lineTo(W, H * 0.035); x.stroke();
    x.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 17) * W;
      x.beginPath(); x.moveTo(a, H * 0.035); x.lineTo(a + (i % 2 ? 1 : -1) * W * 0.03, H * 0.075); x.stroke();
    }
    x.fillStyle = "#32271d"; x.fillRect(0, H * 0.26, W, 7);
    x.fillStyle = "rgba(255,225,180,0.12)"; x.fillRect(0, H * 0.26, W, 1.5);
    x.fillStyle = "#3b2c1c"; x.fillRect(0, H * 0.29, W, 4);

    // far row of machines, hazy
    for (let i = 0; i < 9; i++) {
      const mw = W * 0.07, mh = H * (0.1 + hash(i * 4.1) * 0.05);
      const mx = W * (0.03 + i * 0.11) + hash(i) * 12;
      x.fillStyle = `rgba(44,34,26,${0.9})`;
      x.fillRect(mx, floorY - mh, mw, mh);
      x.fillStyle = "rgba(255,225,180,0.07)"; x.fillRect(mx, floorY - mh, mw, 1.5);
      x.fillStyle = "rgba(100,140,150,0.18)"; x.fillRect(mx + mw * 0.12, floorY - mh * 0.72, mw * 0.5, mh * 0.34);
    }
    // haze at the horizon
    const hz = x.createLinearGradient(0, floorY - H * 0.14, 0, floorY);
    hz.addColorStop(0, "rgba(70,55,40,0)"); hz.addColorStop(1, "rgba(70,55,40,0.4)");
    x.fillStyle = hz; x.fillRect(0, floorY - H * 0.14, W, H * 0.14);
  }

  /* ------------------------ machines and floor ------------------------ */
  private buildMid() {
    const { W, H, floorY } = this;
    const [c, x] = this.layer();
    this.mid = c;
    // floor
    const fl = x.createLinearGradient(0, floorY, 0, H);
    fl.addColorStop(0, "#3a2b1e"); fl.addColorStop(0.35, "#2b1f15"); fl.addColorStop(1, "#150f0a");
    x.fillStyle = fl; x.fillRect(0, floorY, W, H - floorY);
    x.fillStyle = "rgba(255,225,180,0.09)"; x.fillRect(0, floorY, W, 1.5);
    // safety lanes converging on a vanishing point
    x.strokeStyle = "rgba(224,163,58,0.5)"; x.lineWidth = 3;
    for (const f of [0.2, 0.8]) {
      x.beginPath(); x.moveTo(W * 0.5 + (f - 0.5) * W * 0.18, floorY + 2); x.lineTo(W * f + (f - 0.5) * W * 0.9, H); x.stroke();
    }
    // slab joints
    x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 1.2;
    for (let i = 1; i < 6; i++) {
      const y = floorY + Math.pow(i / 6, 1.8) * (H - floorY);
      x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
    }

    this.towers = [];
    const specs: { f: number; kind: "vmc" | "lathe" | "vmc2" | "grind" }[] = [
      { f: 0.17, kind: "vmc" }, { f: 0.39, kind: "lathe" }, { f: 0.63, kind: "vmc2" }, { f: 0.85, kind: "grind" },
    ];
    for (const s of specs) this.machine(x, s.kind, W * s.f, floorY + 6, W);
  }

  private machine(x: Ctx, kind: string, cx: number, base: number, W: number) {
    const { H } = this;
    const w = (kind === "lathe" ? 0.22 : 0.17) * W;
    const h = (kind === "grind" ? 0.2 : 0.3) * H;
    const l = cx - w / 2, t = base - h;
    // soft contact shadow
    const sh = x.createRadialGradient(cx, base + 6, 2, cx, base + 6, w * 0.7);
    sh.addColorStop(0, "rgba(0,0,0,0.55)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    x.save(); x.translate(0, 0); x.scale(1, 0.22); x.fillStyle = sh;
    x.fillRect(cx - w, (base + 6) / 0.22 - w, w * 2, w * 2); x.restore();

    const body = x.createLinearGradient(l, t, l + w, t);
    body.addColorStop(0, "#463a2f"); body.addColorStop(0.5, "#5a4b3c"); body.addColorStop(1, "#352b22");
    x.fillStyle = body; x.fillRect(l, t, w, h);
    x.fillStyle = "rgba(255,235,200,0.35)"; x.fillRect(l, t, w, 2);
    x.fillStyle = "#1d1712"; x.fillRect(l, base - h * 0.1, w, h * 0.1);          // base plinth
    x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(l, t + h * 0.12, w, 1.5);

    if (kind === "lathe") {
      // headstock, chuck, bed and tailstock
      x.fillStyle = "#2e251d"; x.fillRect(l + w * 0.06, t + h * 0.22, w * 0.88, h * 0.42);
      const g = x.createLinearGradient(l, 0, l + w, 0);
      g.addColorStop(0, "rgba(120,160,175,0.4)"); g.addColorStop(0.5, "rgba(160,200,212,0.55)"); g.addColorStop(1, "rgba(80,110,120,0.35)");
      x.fillStyle = g; x.fillRect(l + w * 0.12, t + h * 0.27, w * 0.58, h * 0.3);
      x.fillStyle = "#8a8174"; x.beginPath(); x.arc(l + w * 0.2, t + h * 0.42, h * 0.1, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#3a322a"; x.beginPath(); x.arc(l + w * 0.2, t + h * 0.42, h * 0.05, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#5c5143"; x.fillRect(l + w * 0.2, t + h * 0.4, w * 0.45, h * 0.04);
      x.fillStyle = "#1c1814"; x.fillRect(l + w * 0.76, t + h * 0.26, w * 0.15, h * 0.3);
    } else if (kind === "grind") {
      x.fillStyle = "#2b231c"; x.fillRect(l + w * 0.08, t + h * 0.18, w * 0.84, h * 0.46);
      const g = x.createLinearGradient(l, t, l, t + h);
      g.addColorStop(0, "rgba(130,170,180,0.4)"); g.addColorStop(1, "rgba(70,100,110,0.35)");
      x.fillStyle = g; x.fillRect(l + w * 0.14, t + h * 0.24, w * 0.5, h * 0.34);
      x.fillStyle = "#c9b078"; x.beginPath(); x.arc(l + w * 0.78, t + h * 0.38, h * 0.1, 0, Math.PI * 2); x.fill();
    } else {
      // enclosed machining centre: slanted window, control pendant, door rail
      x.fillStyle = "#241d17"; x.fillRect(l + w * 0.07, t + h * 0.2, w * 0.62, h * 0.55);
      const g = x.createLinearGradient(l + w * 0.1, t + h * 0.2, l + w * 0.64, t + h * 0.72);
      g.addColorStop(0, "rgba(160,200,215,0.55)"); g.addColorStop(0.46, "rgba(105,145,160,0.4)"); g.addColorStop(0.5, "rgba(190,220,232,0.5)"); g.addColorStop(1, "rgba(60,90,100,0.35)");
      x.fillStyle = g; x.fillRect(l + w * 0.1, t + h * 0.24, w * 0.56, h * 0.47);
      x.fillStyle = "#17120e"; x.fillRect(l + w * 0.74, t + h * 0.2, w * 0.2, h * 0.34);
      x.fillStyle = "rgba(120,200,150,0.5)"; x.fillRect(l + w * 0.77, t + h * 0.23, w * 0.14, h * 0.1);
      x.fillStyle = "#6b5f50"; x.fillRect(l + w * 0.07, t + h * 0.76, w * 0.62, 3);
    }
    // signal tower on top
    const tx = l + w * 0.86, ty = t - h * 0.1;
    x.fillStyle = "#1a1510"; x.fillRect(tx - 2, ty, 4, h * 0.1);
    this.towers.push({ x: tx, y: ty });
  }

  /* --------------- foreground: pillars, hoist, pallet --------------- */
  private buildFg() {
    const { W, H, floorY } = this;
    const [c, x] = this.layer();
    this.fg = c;
    for (const side of [0, 1]) {
      const pw = W * 0.034;
      const px = side ? W - pw - W * 0.01 : W * 0.01;
      const g = x.createLinearGradient(px, 0, px + pw, 0);
      g.addColorStop(0, "#0d0a07"); g.addColorStop(0.35, "#3a3027"); g.addColorStop(0.5, "#4a3e32"); g.addColorStop(1, "#0b0806");
      x.fillStyle = g; x.fillRect(px, 0, pw, H);
      for (let y = 0; y < H; y += 120) { x.fillStyle = "rgba(0,0,0,0.5)"; x.fillRect(px, y, pw, 3); }
      // hazard stripes on the lower part
      x.save(); x.beginPath(); x.rect(px, H * 0.78, pw, H * 0.12); x.clip();
      for (let i = -10; i < 20; i++) {
        x.fillStyle = i % 2 ? "#E0A33A" : "#17120d";
        x.beginPath(); x.moveTo(px + i * 14, H * 0.9); x.lineTo(px + i * 14 + 14, H * 0.9);
        x.lineTo(px + i * 14 + 14 + pw, H * 0.78); x.lineTo(px + i * 14 + pw, H * 0.78); x.closePath(); x.fill();
      }
      x.restore();
    }
    // chain hoist hanging in the middle distance
    const hx = W * 0.77;
    x.strokeStyle = "#0b0806"; x.lineWidth = 4; x.beginPath(); x.moveTo(hx, 0); x.lineTo(hx, H * 0.1); x.stroke();
    x.fillStyle = "#231c15"; x.fillRect(hx - 14, H * 0.1, 28, 20);
    for (let i = 0; i < 9; i++) {
      x.strokeStyle = "#5a4e40"; x.lineWidth = 2.5;
      x.beginPath(); x.ellipse(hx, H * 0.1 + 24 + i * 10, i % 2 ? 3 : 5, 6, 0, 0, Math.PI * 2); x.stroke();
    }
    x.strokeStyle = "#8a7d6a"; x.lineWidth = 4; x.beginPath(); x.arc(hx, H * 0.1 + 24 + 9 * 10 + 10, 11, 0.2 * Math.PI, 1.8 * Math.PI); x.stroke();
    // pallet with crates, bottom left
    const px = W * 0.07, py = H - H * 0.03;
    x.fillStyle = "#1a130d"; x.fillRect(px, py - 12, W * 0.12, 12);
    for (let i = 0; i < 3; i++) {
      x.fillStyle = "#6a4a2a"; x.fillRect(px + 8 + i * W * 0.037, py - 12 - H * 0.07, W * 0.033, H * 0.07);
      x.fillStyle = "rgba(255,225,180,0.2)"; x.fillRect(px + 8 + i * W * 0.037, py - 12 - H * 0.07, W * 0.033, 1.5);
    }
    void floorY;
  }

  /* ------------------------ slat sprite variants ------------------------ */
  private buildSlats() {
    const w = this.W - this.guide * 2;
    const h = this.sh;
    this.slats = [];
    for (let v = 0; v < SLAT_VARIANTS; v++) {
      const [c, x] = this.layer(w, h);
      const tone = 0.9 + hash(v * 3.7) * 0.14;
      const r = 132 * tone, g = 124 * tone, b = 113 * tone;
      const rgb = (m: number, a = 1) => `rgba(${Math.min(255, r * m) | 0},${Math.min(255, g * m) | 0},${Math.min(255, b * m) | 0},${a})`;
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, rgb(1.26)); gr.addColorStop(0.07, rgb(1.12)); gr.addColorStop(0.34, rgb(0.98));
      gr.addColorStop(0.5, rgb(1.08)); gr.addColorStop(0.66, rgb(0.92)); gr.addColorStop(0.9, rgb(0.74)); gr.addColorStop(1, rgb(0.46));
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      // two corrugation ribs
      for (const f of [0.3, 0.66]) {
        x.fillStyle = "rgba(255,246,228,0.16)"; x.fillRect(0, h * f, w, 1.2);
        x.fillStyle = "rgba(0,0,0,0.2)"; x.fillRect(0, h * f + 1.2, w, 2);
      }
      // vent slots on a couple of variants
      if (v % 3 === 2) {
        x.fillStyle = "rgba(8,6,4,0.78)";
        for (let sx = w * 0.04; sx < w * 0.96; sx += 22) {
          x.beginPath(); x.roundRect(sx, h * 0.4, 13, h * 0.2, 3); x.fill();
        }
      }
      // staining and rust
      for (let s = 0; s < 4; s++) {
        const sx = hash(v * 17 + s * 5.3) * w, sw = 40 + hash(v * 9 + s) * 140;
        const sg = x.createLinearGradient(sx, 0, sx + sw, 0);
        sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.5, `rgba(24,14,6,${0.05 + hash(v + s * 3) * 0.07})`); sg.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = sg; x.fillRect(sx, 0, sw, h);
      }
      for (let s = 0; s < 5; s++) {
        const sx = hash(v * 41 + s * 2.1) * w;
        const rg = x.createRadialGradient(sx, h * 0.92, 1, sx, h * 0.92, 20 + hash(s + v) * 30);
        rg.addColorStop(0, "rgba(120,60,24,0.11)"); rg.addColorStop(1, "rgba(120,60,24,0)");
        x.fillStyle = rg; x.fillRect(sx - 60, 0, 120, h);
      }
      for (let s = 0; s < 40; s++) {
        const sx = hash(v * 91 + s * 7.3) * w, sy = 2 + hash(v * 53 + s * 3.9) * (h - 4), len = 4 + hash(v * 31 + s * 1.7) * 34;
        x.fillStyle = hash(v * 13 + s * 2.2) > 0.45 ? `rgba(0,0,0,${0.06 + hash(s + v) * 0.1})` : "rgba(255,240,220,0.08)";
        x.fillRect(sx, sy, len, 0.8);
      }
      // seam shadow and end hinges
      x.fillStyle = "rgba(0,0,0,0.5)"; x.fillRect(0, h - 1.6, w, 1.6);
      x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(0, 0, 1, h); x.fillRect(w - 1, 0, 1, h);
      for (const ex of [10, w - 14]) { x.fillStyle = "rgba(20,14,8,0.7)"; x.fillRect(ex, h * 0.18, 4, h * 0.64); }
      this.slats.push(c);
    }
  }

  /** a soft round light sprite, drawn scaled and tinted instead of building gradients every frame */
  private buildGlow() {
    const s = 256;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,236,200,1)"); g.addColorStop(0.18, "rgba(255,214,150,0.55)");
    g.addColorStop(0.5, "rgba(255,190,110,0.15)"); g.addColorStop(1, "rgba(255,190,110,0)");
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    this.glow = c;
  }

  /* ------------------------------- frame ------------------------------- */
  /** advance the spring toward `target` (0..1) and paint one frame */
  frame(now: number, dt: number, target: number, snap: boolean, reduced: boolean) {
    const t0 = performance.now();
    if (!this.W) return;
    if (snap || reduced) {
      this.lift = reduced ? 1 : target;
      this.speed = 0;
    } else {
      const k = 70, c = 2 * Math.sqrt(k) * 0.92;
      let left = Math.min(dt, 0.05);
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        this.speed += (k * (target - this.lift) - c * this.speed) * h;
        this.lift += this.speed * h;
        if (this.lift <= 0) { this.lift = 0; this.speed = Math.max(0, this.speed); }
        if (this.lift >= 1) { this.lift = 1; this.speed = Math.min(0, this.speed); }
        left -= h;
      }
    }
    const L = this.lift;
    const t = now * 0.001;
    this.drawShop(t, L);
    if (L < 0.9995) this.drawDoor(t, L);
    this.ms = mix(this.ms, performance.now() - t0, 0.1);
  }

  private blit(layer: HTMLCanvasElement, zoom: number, shiftY: number) {
    const { ctx, W, H } = this;
    const w = W * zoom, h = H * zoom;
    ctx.drawImage(layer, (W - w) / 2, (H - h) / 2 + shiftY, w, h);
  }

  private drawShop(t: number, L: number) {
    const { ctx, W, H, floorY } = this;
    ctx.fillStyle = "#0b0806";
    ctx.fillRect(0, 0, W, H);
    const z = 0.14 * (1 - smooth(0, 1, L));          // the camera eases back as the door opens
    this.blit(this.back, 1 + z * 0.45, z * H * 0.1);
    this.blit(this.mid, 1 + z * 0.9, z * H * 0.12);

    // the whole shop is dim until the lamps catch
    const lampLevel: number[] = LAMPS.map((_, i) => {
      const th = 0.06 + i * 0.075;
      const ramp = smooth(th, th + 0.12, L);
      const flick = ramp < 1 ? (Math.sin(L * 310 + i * 5.1) > 0.15 ? 1 : 0.2) : 0.97 + 0.03 * Math.sin(t * 3 + i * 2.1);
      return ramp * flick;
    });
    const avg = lampLevel.reduce((a, b) => a + b, 0) / lampLevel.length;
    ctx.fillStyle = `rgba(8,6,4,${(0.62 * (1 - avg * 0.85)).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);

    // machine tower lights come on with the shop
    const zm = 1 + z * 0.9;
    const mapX = (px: number) => (W - W * zm) / 2 + px * zm;
    const mapY = (py: number) => (H - H * zm) / 2 + z * H * 0.12 + py * zm;
    this.towers.forEach((tw, i) => {
      const on = smooth(0.35, 0.5, L);
      const x = mapX(tw.x), y = mapY(tw.y);
      const blink = (Math.sin(t * 2 + i * 1.7) + 1) / 2 > 0.45;
      const cols = ["#4fbf6a", "#E0A33A", "#d4543f"];
      cols.forEach((col, k) => {
        const lit = k === 0 ? on : k === 1 ? on * (blink ? 1 : 0.25) : 0.12;
        ctx.globalAlpha = 0.25 + 0.75 * lit;
        ctx.fillStyle = col;
        ctx.fillRect(x - 3 * zm, y - 11 * zm + k * 3.2 * zm, 6 * zm, 2.6 * zm);
      });
      ctx.globalAlpha = 1;
      if (on > 0.3) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.25 * on;
        ctx.drawImage(this.glow, x - 16 * zm, y - 22 * zm, 32 * zm, 32 * zm);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    });

    // lamps: cords, housings, light cones, bloom, and pools on the floor
    ctx.globalCompositeOperation = "lighter";
    LAMPS.forEach((f, i) => {
      const lv = lampLevel[i];
      const lx = W * f, len = H * (0.15 + (i % 2) * 0.04);
      if (lv > 0.01) {
        const cone = ctx.createLinearGradient(0, len, 0, floorY + (H - floorY) * 0.3);
        cone.addColorStop(0, `rgba(255,214,150,${(0.2 * lv).toFixed(3)})`);
        cone.addColorStop(1, "rgba(255,214,150,0)");
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(lx - 22, len + 8); ctx.lineTo(lx + 22, len + 8);
        ctx.lineTo(lx + W * 0.1, floorY + (H - floorY) * 0.3); ctx.lineTo(lx - W * 0.1, floorY + (H - floorY) * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.85 * lv;
        ctx.drawImage(this.glow, lx - H * 0.26, len - H * 0.2, H * 0.52, H * 0.52);
        ctx.globalAlpha = 0.5 * lv;                       // pool of light on the floor
        ctx.drawImage(this.glow, lx - W * 0.1, floorY + (H - floorY) * 0.12, W * 0.2, (H - floorY) * 0.5);
        ctx.globalAlpha = 1;
      }
    });
    ctx.globalCompositeOperation = "source-over";
    LAMPS.forEach((f, i) => {
      const lv = lampLevel[i];
      const lx = W * f, len = H * (0.15 + (i % 2) * 0.04);
      ctx.strokeStyle = "#0a0806"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, len); ctx.stroke();
      ctx.fillStyle = "#1c1712";
      ctx.beginPath(); ctx.moveTo(lx - 24, len + 10); ctx.lineTo(lx - 9, len - 3); ctx.lineTo(lx + 9, len - 3); ctx.lineTo(lx + 24, len + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(${40 + 215 * lv | 0},${36 + 200 * lv | 0},${30 + 160 * lv | 0},1)`;
      ctx.fillRect(lx - 19, len + 9, 38, 2.8);
    });

    // dust drifting through the light
    if (L > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      for (const d of this.dust) {
        const y = (((d.y - t * d.sp) % 1) + 1) % 1;
        const x = d.x + Math.sin(t * 0.3 + d.ph) * 0.012 + t * d.dr;
        const a = (0.12 + 0.12 * Math.sin(t * 0.8 + d.ph)) * avg;
        ctx.fillStyle = `rgba(255,232,190,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc((((x % 1) + 1) % 1) * W, y * H * 0.85, d.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    this.blit(this.fg, 1 + z * 1.7, z * H * 0.16);

    // keep the middle calm for the headline and the player
    const vig = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.18, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    vig.addColorStop(0, "rgba(10,7,5,0.4)"); vig.addColorStop(1, "rgba(10,7,5,0.8)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  /* -------------------------------- door -------------------------------- */
  private drawDoor(t: number, L: number) {
    const { ctx, W, H, guide, sh } = this;
    const groundTop = H - this.ground;
    const hood = 20 + L * H * 0.075;                          // the barrel grows as the door winds onto it
    const barH = 28;
    const travel = groundTop + barH + hood + 40;
    const yBottom = groundTop - L * travel;                    // underside of the bottom bar
    const barTop = yBottom - barH;
    const x0 = guide, x1 = W - guide, w = x1 - x0;
    const shake = clamp(Math.abs(this.speed) * 6, 0, 2.4);
    const open = clamp(L * 12);
    const wrap = Math.min(H * 0.26, 170);                      // slats foreshorten over this height below the barrel

    // ground outside: concrete, lit warm once the gap opens
    const fade = 1 - smooth(0.55, 0.95, L);
    if (fade > 0.01) {
      ctx.globalAlpha = fade;
      const cg = ctx.createLinearGradient(0, groundTop, 0, H);
      cg.addColorStop(0, "#4a4036"); cg.addColorStop(1, "#1c1712");
      ctx.fillStyle = cg; ctx.fillRect(0, groundTop, W, this.ground);
      ctx.fillStyle = "rgba(255,240,220,0.14)"; ctx.fillRect(0, groundTop, W, 1.5);
      for (let i = 0; i < 26; i++) { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(hash(i * 5.7) * W, groundTop + 3 + hash(i) * (this.ground - 6), 10 + hash(i * 2) * 40, 1); }
      if (open > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fade * open * 0.8;
        ctx.drawImage(this.glow, W * 0.5 - W * 0.42, groundTop - H * 0.05, W * 0.84, this.ground + H * 0.16);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    }

    // slats, stacked up from the bottom bar; near the barrel they squash as if wrapping
    ctx.save();
    ctx.beginPath(); ctx.rect(0, hood, W, H); ctx.clip();
    const warp = (y: number) => {
      const u = clamp((y - hood) / wrap);
      return u >= 1 ? y : hood + wrap * u * u * (2 - u);   // eases to a stop at the barrel, joins the straight run smoothly
    };
    for (let k = 0; barTop - k * sh > hood - sh * 2; k++) {
      const y1 = barTop - k * sh, y0 = y1 - sh;
      // each slat trails the one below it while the door is moving: a travelling ripple
      const lag = Math.sin(t * 17 - k * 0.55) * shake * 0.7;
      const wy0 = warp(y0) + lag, wy1 = warp(y1) + lag;
      const hh = wy1 - wy0;
      if (hh < 0.7 || wy1 < hood) continue;
      const ox = shake * 0.6 * (hash(k + Math.floor(t * 40)) - 0.5);
      ctx.drawImage(this.slats[k % SLAT_VARIANTS], x0 + ox, wy0, w, hh + 0.6);
      const u = clamp(((y0 + y1) / 2 - hood) / wrap);
      if (u < 1) {
        ctx.fillStyle = `rgba(0,0,0,${(0.55 * (1 - u) * (1 - u)).toFixed(3)})`;
        ctx.fillRect(x0, wy0, w, hh + 0.6);
      }
    }
    // dawn light on the street side, warm spill from the gap once it opens
    const cool = ctx.createLinearGradient(0, hood, 0, groundTop);
    cool.addColorStop(0, "rgba(90,120,160,0.16)"); cool.addColorStop(1, "rgba(90,120,160,0)");
    ctx.fillStyle = cool; ctx.fillRect(x0, hood, w, H);
    if (open > 0) {
      ctx.globalCompositeOperation = "lighter";
      const wg = ctx.createRadialGradient(W / 2, barTop, 10, W / 2, barTop, H * 0.55);
      wg.addColorStop(0, `rgba(255,190,110,${(0.34 * open).toFixed(3)})`); wg.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = wg; ctx.fillRect(x0, 0, w, H);
      ctx.globalCompositeOperation = "source-over";
    }
    // shadow cast by the barrel
    const hs = ctx.createLinearGradient(0, hood, 0, hood + 80);
    hs.addColorStop(0, "rgba(0,0,0,0.55)"); hs.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hs; ctx.fillRect(0, hood, W, 80);
    ctx.restore();

    // bottom bar: aluminium profile, grip, locks, padlock that swings with the door
    if (yBottom > -barH - 6) {
      const bg = ctx.createLinearGradient(0, barTop, 0, yBottom);
      bg.addColorStop(0, "#c2b8a8"); bg.addColorStop(0.16, "#8d8477"); bg.addColorStop(0.7, "#625b51"); bg.addColorStop(1, "#2a2620");
      ctx.fillStyle = bg; ctx.fillRect(x0, barTop, w, barH);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x0, yBottom - 2, w, 2);
      const gw = Math.min(160, W * 0.12);
      ctx.fillStyle = "#26211b"; ctx.beginPath(); ctx.roundRect(W / 2 - gw / 2, barTop + 8, gw, 11, 4); ctx.fill();
      ctx.fillStyle = "rgba(255,240,220,0.2)"; ctx.fillRect(W / 2 - gw / 2 + 3, barTop + 19, gw - 6, 1);
      for (const bx of [x0 + 24, x1 - 24]) {
        ctx.fillStyle = "#37322b"; ctx.beginPath(); ctx.arc(bx, barTop + barH / 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,240,220,0.3)"; ctx.beginPath(); ctx.arc(bx - 1, barTop + barH / 2 - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      const sway = clamp(this.speed * 0.9, -0.5, 0.5) + Math.sin(t * 1.4) * 0.015;
      ctx.save(); ctx.translate(x1 - 90, barTop + 6); ctx.rotate(sway);
      ctx.strokeStyle = "#9b9284"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 4, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "#c9a24a"; ctx.beginPath(); ctx.roundRect(-8, 4, 16, 13, 3); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-1, 9, 2, 4);
      ctx.restore();
      if (open > 0) {
        ctx.globalCompositeOperation = "lighter";
        const sp = ctx.createLinearGradient(0, yBottom, 0, yBottom + 110);
        sp.addColorStop(0, `rgba(255,205,130,${(0.55 * open).toFixed(3)})`); sp.addColorStop(1, "rgba(255,205,130,0)");
        ctx.fillStyle = sp; ctx.fillRect(x0, yBottom, w, 110);
        ctx.fillStyle = `rgba(255,222,160,${(0.8 * open).toFixed(3)})`; ctx.fillRect(x0, yBottom - 1.5, w, 1.5);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // guide rails with bolts
    for (const gx of [0, W - guide]) {
      const rg = ctx.createLinearGradient(gx, 0, gx + guide, 0);
      rg.addColorStop(0, gx === 0 ? "#171410" : "#5d564c"); rg.addColorStop(0.5, "#3a352e"); rg.addColorStop(1, gx === 0 ? "#5d564c" : "#171410");
      ctx.fillStyle = rg; ctx.fillRect(gx, 0, guide, H);
      for (let y = 60; y < H; y += 96) {
        ctx.fillStyle = "#12100c"; ctx.beginPath(); ctx.arc(gx + guide / 2, y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,240,220,0.22)"; ctx.beginPath(); ctx.arc(gx + guide / 2 - 0.7, y - 0.8, 1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // barrel housing
    const hg = ctx.createLinearGradient(0, 0, 0, hood);
    hg.addColorStop(0, "#221e18"); hg.addColorStop(0.3, "#70685c"); hg.addColorStop(0.55, "#4a443b"); hg.addColorStop(1, "#17140f");
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, hood);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, hood - 2, W, 2);
    ctx.fillStyle = "rgba(255,240,220,0.16)"; ctx.fillRect(0, 3, W, 1.2);
    for (let x = 70; x < W; x += 170) {
      ctx.fillStyle = "rgba(255,240,220,0.2)"; ctx.beginPath(); ctx.arc(x, hood * 0.5, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}
