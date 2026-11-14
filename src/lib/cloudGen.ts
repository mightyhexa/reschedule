import { clamp01, hash, smooth } from "./noise";

export interface CloudOptions {
  seed: number;
  /** density threshold where cloud starts (higher = fewer clouds) */
  cover: number;
  /** softness of the cloud edge */
  soft: number;
  /** vertical centre of the cloud band, 0..1 */
  bandY: number;
  /** half-height of the band, 0..1 */
  bandH: number;
  /** horizontal noise cells; the tile repeats seamlessly in x */
  cells: number;
}

function pnoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const a = hash(x0, iy, seed);
  const b = hash(x1, iy, seed);
  const c = hash(x0, iy + 1, seed);
  const d = hash(x1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function pfbm(u: number, v: number, period: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * pnoise(u, v, p, seed + i * 31);
    norm += amp;
    amp *= 0.52;
    u *= 2;
    v *= 2;
    p *= 2;
  }
  return sum / norm;
}

const SHADOW = [132, 160, 204];
const MID = [216, 228, 245];
const LIGHT = [255, 249, 238];

/** Seamlessly tileable (in x) volumetric cloud texture, returned as RGBA. */
export function renderClouds(w: number, h: number, o: CloudOptions): Uint8ClampedArray {
  const t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yy = y / h;
    const prof = 1 - clamp01(Math.abs(yy - o.bandY) / o.bandH);
    const v = (y / w) * o.cells * 4.4;
    for (let x = 0; x < w; x++) {
      const d = pfbm((x / w) * o.cells, v, o.cells, o.seed, 6);
      t[y * w + x] = d + (prof - 0.5) * 0.7;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const dy = Math.max(2, Math.round(h * 0.045));
  const dx = Math.max(2, Math.round(w * 0.006));
  for (let y = 0; y < h; y++) {
    const yUp = Math.max(0, y - dy);
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const tv = t[idx];
      const al = smooth(clamp01((tv - o.cover) / o.soft));
      if (al < 0.004) continue;
      const up = t[yUp * w + x];
      const left = t[y * w + ((x - dx + w) % w)];
      const core = smooth(clamp01((tv - o.cover - o.soft) / 0.28));
      const lit = clamp01(0.58 + 3.4 * (tv - up) + 1.5 * (tv - left) - core * 0.24);
      let r: number;
      let g: number;
      let b: number;
      if (lit < 0.5) {
        const k = lit / 0.5;
        r = SHADOW[0] + (MID[0] - SHADOW[0]) * k;
        g = SHADOW[1] + (MID[1] - SHADOW[1]) * k;
        b = SHADOW[2] + (MID[2] - SHADOW[2]) * k;
      } else {
        const k = (lit - 0.5) / 0.5;
        r = MID[0] + (LIGHT[0] - MID[0]) * k;
        g = MID[1] + (LIGHT[1] - MID[1]) * k;
        b = MID[2] + (LIGHT[2] - MID[2]) * k;
      }
      const i4 = idx * 4;
      out[i4] = r;
      out[i4 + 1] = g;
      out[i4 + 2] = b;
      out[i4 + 3] = al * 255;
    }
  }
  return out;
}
