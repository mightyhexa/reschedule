import { clamp01, fbm, hash, smooth, vnoise } from "./noise";

export type RGB = [number, number, number];

export interface EdgeOptions {
  seed: number;
  paper: RGB;
  rim: RGB;
  /** CSS px from the top of the strip to the average tear line */
  baseY: number;
  /** device pixels per CSS pixel */
  scale: number;
}

/**
 * Renders a torn-paper edge as raw RGBA pixels. Transparent above the tear (with a soft cast
 * shadow and stray paper fibres), a bright fibrous rim at the tear, then grainy paper that fades
 * into the flat paper colour so it blends seamlessly into the section below.
 */
export function renderPaperEdge(w: number, h: number, o: EdgeOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const s = o.scale;
  const edge = new Float32Array(w);

  for (let x = 0; x < w; x++) {
    const cx = x / s;
    let e =
      o.baseY +
      24 * (vnoise(cx / 420, 0, o.seed) - 0.5) * 2 +
      11 * (vnoise(cx / 120, 3, o.seed + 1) - 0.5) * 2 +
      4.2 * (vnoise(cx / 30, 7, o.seed + 2) - 0.5) * 2 +
      1.6 * (vnoise(cx / 9, 11, o.seed + 3) - 0.5) * 2;
    const nz = vnoise(cx / 140, 19, o.seed + 4);
    if (nz > 0.78) e += (nz - 0.78) * 70 * (0.5 + 0.5 * vnoise(cx / 6, 23, o.seed + 5));
    edge[x] = e * s;
  }

  const [pr, pg, pb] = o.paper;
  const [rr, rg, rb] = o.rim;
  const solidFrom = 36 * s;
  const clearAbove = 26 * s;

  for (let y = 0; y < h; y++) {
    const cy = y / s;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const e = edge[x];
      if (y > e + solidFrom) {
        out[i] = pr;
        out[i + 1] = pg;
        out[i + 2] = pb;
        out[i + 3] = 255;
        continue;
      }
      if (y < e - clearAbove) continue;

      const cx = x / s;
      const disp =
        (fbm(cx * 0.22, cy * 0.22, o.seed + 9, 3) - 0.5) * 7 +
        (vnoise(cx * 1.3, cy * 0.25, o.seed + 10) - 0.5) * 2.4;
      const d = (y - e) / s + disp;

      if (d > 0) {
        const rimW = 2.2 + 4.2 * vnoise(cx / 26, 31, o.seed + 11) + 2 * vnoise(cx * 0.9, cy * 0.9, o.seed + 12);
        const t = smooth(clamp01((d - rimW) / 2.4));
        const fib = 0.9 + 0.1 * vnoise(cx * 2.1, cy * 0.7, o.seed + 13);
        const gA = 1 - clamp01(d / 32);
        const grain =
          1 + ((vnoise(cx * 1.7, cy * 1.7, o.seed + 14) - 0.5) * 0.08 + (hash(x, y, o.seed) - 0.5) * 0.035) * gA;
        const curl = 1 - 0.045 * Math.exp(-Math.abs(d - rimW - 2.5) / 3.5) * gA;
        const k = grain * curl;
        out[i] = Math.min(255, (rr * fib * (1 - t) + pr * t) * k);
        out[i + 1] = Math.min(255, (rg * fib * (1 - t) + pg * t) * k);
        out[i + 2] = Math.min(255, (rb * fib * (1 - t) + pb * t) * k);
        out[i + 3] = clamp01(d / 0.9) * 255;
      } else {
        const hair = vnoise(cx * 0.95, cy * 0.16, o.seed + 15);
        const hairA = d > -7 && hair > 0.8 ? (hair - 0.8) * 4 * (1 + d / 7) : 0;
        if (hairA > 0.03) {
          out[i] = rr;
          out[i + 1] = rg;
          out[i + 2] = rb;
          out[i + 3] = Math.min(1, hairA * 0.85) * 255;
        } else {
          out[i] = 14;
          out[i + 1] = 9;
          out[i + 2] = 6;
          out[i + 3] = Math.exp(d / 9) * 0.6 * 255;
        }
      }
    }
  }
  return out;
}
