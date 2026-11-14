import { useEffect, useRef } from "react";
import { renderPaperEdge, type RGB } from "./paperEdgeGen";

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

interface PaperEdgeProps {
  seed?: number;
  paper?: string;
  rim?: string;
  height?: number;
  baseY?: number;
}

/**
 * A torn-paper edge that sits on top of its parent (the parent must be position: relative and
 * painted with the same paper colour). It is drawn pixel by pixel at the real width of the
 * parent, so it never stretches, and it adds a fibrous white rim, stray fibres, paper grain
 * and a soft cast shadow on whatever is behind it.
 */
export function PaperEdge({ seed = 47, paper = "#F7F1E6", rim = "#FFFDF8", height = 150, baseY = 100 }: PaperEdgeProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let timer = 0;

    const draw = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(parent.clientWidth * scale));
      const h = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = w;
      canvas.height = h;
      const img = ctx.createImageData(w, h);
      img.data.set(renderPaperEdge(w, h, { seed, paper: parseHex(paper), rim: parseHex(rim), baseY, scale }));
      ctx.putImageData(img, 0, 0);
    };

    draw();
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 140);
    });
    ro.observe(parent);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [seed, paper, rim, height, baseY]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-full block w-full"
      style={{ height }}
    />
  );
}
