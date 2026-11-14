import { useEffect, useState } from "react";
import { api } from "./api";
import type { User } from "./api";

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** Whether the server offers the one-click demo workspace. Asked once per page load. */
export function useDemoEnabled(): boolean {
  const [on, setOn] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) return setOn(cached);
    pending ??= api<{ demo?: boolean }>("/auth/config").then((c) => !!c.demo).catch(() => false);
    let live = true;
    pending.then((v) => {
      cached = v;
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}

const styles = {
  primary: "bg-terra text-ivory shadow-[0_10px_28px_-12px_rgba(200,100,59,0.8)] hover:-translate-y-0.5 px-6 py-3.5 text-[15px]",
  nav: "bg-terra text-ivory hover:-translate-y-0.5 px-4 py-2 text-[13px]",
  light: "bg-ivory text-ink hover:-translate-y-0.5 px-6 py-3.5 text-[15px]",
} as const;

/** One click: a private demo shop with sample jobs, a live plan and a waiting repair. No email, password or code. */
export function DemoButton({ variant = "primary", className = "", onUser, label }: {
  variant?: keyof typeof styles; className?: string; onUser?: (u: User) => void; label?: string;
}) {
  const enabled = useDemoEnabled();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!enabled) return null;

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ user: User }>("/auth/demo", { method: "POST" });
      onUser?.(r.user);
      location.hash = "#/app";
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button type="button" onClick={open} disabled={busy} data-demo-button
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-300 disabled:cursor-wait disabled:opacity-70 ${styles[variant]}`}>
        {busy ? "Setting up your workspace…" : label ?? "Open the demo workspace"}
      </button>
      {err && <span role="alert" className="text-xs text-brick">{err}</span>}
    </span>
  );
}
