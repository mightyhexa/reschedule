import { useEffect } from "react";
import { animate, useMotionValue } from "framer-motion";

/** A motion value that eases toward `target` whenever `target` changes. */
export function useProgress(target: number, duration = 1.1) {
  const mv = useMotionValue(0);
  useEffect(() => {
    const controls = animate(mv, target, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [target, duration, mv]);
  return mv;
}
