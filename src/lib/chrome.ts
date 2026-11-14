/**
 * Works out whether the page behind a fixed UI element (nav, side rail) is dark or light,
 * by walking up from the element under the point until it finds a mostly-opaque background.
 * Anything marked data-chrome-ignore (the nav and rail themselves) is skipped.
 */
export function toneAt(x: number, y: number): "light" | "dark" {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (el.closest("[data-chrome-ignore]")) continue;
    let node: Element | null = el;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(",").map((v) => parseFloat(v));
        const alpha = p.length > 3 ? p[3] : 1;
        if (alpha > 0.6) {
          const lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
          return lum < 0.45 ? "dark" : "light";
        }
      }
      node = node.parentElement;
    }
  }
  return "light";
}
