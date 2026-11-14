import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export const ease = [0.22, 1, 0.36, 1] as const;
export const stagger = { show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
export const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={stagger} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function Title({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <motion.div variants={rise} className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="h-display text-4xl text-ink sm:text-5xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </motion.div>
  );
}

export function Card({ children, className = "", tone = "ivory", ...rest }: { children: ReactNode; className?: string; tone?: "ivory" | "dark" | "cream" } & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const bg = tone === "dark" ? "border-[#3D3024] bg-[#211A14] text-[#FAF3E8]" : tone === "cream" ? "border-line bg-cream/60" : "border-line bg-ivory shadow-card";
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease }} className={`rounded-[28px] border p-6 sm:p-7 ${bg} ${className}`} {...(rest as object)}>
      {children}
    </motion.div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "terra" | "ghost" | "danger"; busy?: boolean; small?: boolean };
export function Button({ variant = "dark", busy, small, children, className = "", disabled, ...rest }: BtnProps) {
  const v = {
    dark: "bg-ink text-ivory hover:-translate-y-0.5",
    terra: "bg-terra text-ivory hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(200,100,59,0.7)]",
    ghost: "border border-ink/20 text-ink hover:bg-ink/5",
    danger: "border border-brick/40 text-brick hover:bg-brick/10",
  }[variant];
  return (
    <button
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${small ? "px-4 py-2 text-[13px]" : "px-6 py-3 text-sm"} ${v} ${className}`}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span style={{ width: size, height: size }} className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export const inputCls =
  "w-full rounded-xl border border-line bg-cream/40 px-4 py-3 text-[15px] text-ink outline-none transition-all placeholder:text-soft/60 focus:border-terra focus:bg-ivory focus:shadow-[0_0_0_3px_rgba(200,100,59,0.18)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-soft">{hint}</span>}
    </label>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Badge({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "sage" | "terra" | "amber" | "brick" | "ink" }) {
  const t = {
    soft: "bg-cream text-soft border-line",
    sage: "bg-[#E4EBDD] text-[#44563A] border-[#7A8F6B]/40",
    terra: "bg-[#F8DDB0]/60 text-[#9A4A25] border-terra/40",
    amber: "bg-amber/20 text-[#7A5410] border-amber/50",
    brick: "bg-brick/10 text-brick border-brick/30",
    ink: "bg-ink text-ivory border-ink",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${t}`}>{children}</span>;
}

export function Alert({ tone = "brick", children }: { tone?: "brick" | "sage" | "amber"; children: ReactNode }) {
  const t = { brick: "border-brick/30 bg-brick/5 text-brick", sage: "border-sage/40 bg-sage/10 text-[#44563A]", amber: "border-amber/50 bg-amber/10 text-[#7A5410]" }[tone];
  return (
    <motion.p role={tone === "brick" ? "alert" : "status"} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border px-4 py-3 text-sm ${t}`}>
      {children}
    </motion.p>
  );
}

export function Count({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? to : 0);
  const text = useTransform(mv, (v) => v.toFixed(decimals) + suffix);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(mv, to, { duration: 1.1, ease });
    return () => c.stop();
  }, [inView, to, reduce, mv]);
  useEffect(() => {
    if (reduce) mv.set(to);
  }, [to, reduce, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

export function Stat({ label, value, suffix, decimals, sub, tone }: { label: string; value: number | null; suffix?: string; decimals?: number; sub?: string; tone?: "sage" | "brick" | "terra" }) {
  const c = tone === "sage" ? "text-[#44563A]" : tone === "brick" ? "text-brick" : tone === "terra" ? "text-terra" : "text-ink";
  return (
    <Card className="!p-5">
      <div className="eyebrow">{label}</div>
      <div className={`h-display mt-3 text-4xl ${c}`}>{value == null ? "—" : <Count to={value} suffix={suffix} decimals={decimals} />}</div>
      {sub && <div className="mt-1.5 text-xs text-soft">{sub}</div>}
    </Card>
  );
}

// ---- toasts
const ToastCtx = createContext<(msg: string, tone?: "sage" | "brick") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([]);
  const push = (msg: string, tone: "sage" | "brick" = "sage") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div key={i.id} initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.35, ease }}
              className={`rounded-full px-5 py-2.5 text-sm shadow-lift ${i.tone === "brick" ? "bg-brick text-ivory" : "bg-ink text-ivory"}`}>
              {i.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-dashed border-ink/20 px-6 py-14 text-center">
      <div className="h-display text-2xl text-ink">{title}</div>
      {children && <div className="mx-auto mt-3 max-w-md text-[15px] text-soft">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-soft">
      <Spinner size={22} />
    </div>
  );
}
