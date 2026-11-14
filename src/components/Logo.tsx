import { motion, useReducedMotion } from "framer-motion";

/** Small cloud made of schedule blocks. One block steps aside and settles, on a loop. */
export function LogoMark({ size = 34, loop = true }: { size?: number; loop?: boolean }) {
  const reduce = useReducedMotion();
  const play = loop && !reduce;
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 64 40" aria-hidden="true">
      <rect x="4" y="24" width="18" height="12" rx="4" fill="#7A8F6B" />
      <rect x="24" y="24" width="18" height="12" rx="4" fill="#7A8F6B" />
      <rect x="44" y="24" width="16" height="12" rx="4" fill="#7A8F6B" />
      <rect x="12" y="10" width="18" height="12" rx="4" fill="#E0A33A" />
      <motion.rect
        x="34"
        y="4"
        width="18"
        height="12"
        rx="4"
        fill="#C8643B"
        animate={play ? { x: [0, -7, -7, 0], y: [0, 0, 0, 0] } : undefined}
        transition={play ? { duration: 4.2, repeat: Infinity, times: [0, 0.18, 0.6, 0.78], ease: [0.22, 1, 0.36, 1] } : undefined}
      />
    </svg>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-[22px] font-medium tracking-tight text-ink">ReSchedule</span>
    </span>
  );
}
