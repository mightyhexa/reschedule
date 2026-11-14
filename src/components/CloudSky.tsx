import { useEffect, useRef, useState } from "react";
import { renderClouds, type CloudOptions } from "../lib/cloudGen";

interface Layer {
  opts: CloudOptions;
  width: string;
  bottom: string;
  opacity: number;
  seconds: number;
}

const TILE_W = 1280;
const TILE_H = 256;

const LAYERS: Layer[] = [
  { opts: { seed: 3, cover: 0.56, soft: 0.12, bandY: 0.45, bandH: 0.45, cells: 5 }, width: "190%", bottom: "30%", opacity: 0.55, seconds: 210 },
  { opts: { seed: 7, cover: 0.5, soft: 0.14, bandY: 0.55, bandH: 0.5, cells: 4 }, width: "250%", bottom: "6%", opacity: 0.85, seconds: 140 },
  { opts: { seed: 11, cover: 0.44, soft: 0.2, bandY: 0.68, bandH: 0.55, cells: 3 }, width: "330%", bottom: "-8%", opacity: 1, seconds: 90 },
];

/**
 * A real, endlessly drifting sky. Each cloud layer is a procedurally generated, seamlessly
 * tileable volumetric texture (lit tops, shaded undersides) that scrolls at its own speed.
 */
export function CloudSky() {
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let cancelled = false;
    let started = false;

    const build = () => {
      if (started) return;
      started = true;
      LAYERS.forEach((layer, i) => {
        window.setTimeout(() => {
          const canvas = refs[i].current;
          if (cancelled || !canvas) return;
          const tile = renderClouds(TILE_W, TILE_H, layer.opts);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          canvas.width = TILE_W * 2;
          canvas.height = TILE_H;
          const img = ctx.createImageData(TILE_W, TILE_H);
          img.data.set(tile);
          ctx.putImageData(img, 0, 0);
          ctx.putImageData(img, TILE_W, 0);
          if (i === LAYERS.length - 1) setReady(true);
        }, i * 60);
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          build();
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg,#2f78dd 0%,#4f98ec 34%,#8fc0f4 66%,#d6e8fa 100%)" }}
      />
      <div
        className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,246,222,.85) 0%, rgba(255,240,205,.35) 34%, rgba(255,240,205,0) 70%)" }}
      />
      {LAYERS.map((layer, i) => (
        <canvas
          key={i}
          ref={refs[i]}
          className="sky-drift absolute left-0 will-change-transform"
          style={{
            width: layer.width,
            bottom: layer.bottom,
            opacity: ready ? layer.opacity : 0,
            transition: "opacity 1.4s ease",
            animationDuration: `${layer.seconds}s`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-1/4" style={{ background: "linear-gradient(180deg,rgba(214,232,250,0),rgba(236,244,252,.55))" }} />
    </div>
  );
}
