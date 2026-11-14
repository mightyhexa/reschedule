import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Wordmark } from "../../components/Logo";
import { API_BASE, ApiError, api } from "../api";
import type { User } from "../api";
import { useAuth } from "../auth";
import { go, hashQuery } from "../router";
import { openPolicy } from "../../components/PolicyModal";
import { DemoButton } from "../DemoButton";
import { Alert, Button, Field, Input, Spinner, ease } from "../ui";

type Mode = "login" | "signup" | "forgot";
type Step = "form" | "code";
interface Cfg { google: boolean; whatsapp: boolean; email: boolean; dev_codes: boolean; demo?: boolean }

function strength(pw: string): { pct: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const pct = pw ? Math.max(8, (s / 5) * 100) : 0;
  return s <= 1 ? { pct, label: "Weak", color: "#B5443A" } : s <= 3 ? { pct, label: "Okay", color: "#E0A33A" } : { pct, label: "Strong", color: "#7A8F6B" };
}

function Brand() {
  const blocks = [
    { x: 0, y: 0, w: 30, c: "#7A8F6B" }, { x: 32, y: 0, w: 22, c: "#7A8F6B" }, { x: 56, y: 0, w: 34, c: "#7A8F6B" },
    { x: 8, y: 22, w: 26, c: "#7A8F6B" }, { x: 36, y: 22, w: 30, c: "#E0A33A" }, { x: 68, y: 22, w: 22, c: "#7A8F6B" },
    { x: 0, y: 44, w: 40, c: "#7A8F6B" }, { x: 42, y: 44, w: 24, c: "#7A8F6B" },
  ];
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden rounded-[36px] border border-line bg-ivory p-10 shadow-card lg:flex">
      <div className="hero-atmosphere absolute inset-0 -z-0 opacity-70" />
      <a href="#top" onClick={() => (location.hash = "")} className="relative z-10"><Wordmark size={30} /></a>
      <div className="relative z-10">
        <motion.svg viewBox="0 0 92 66" className="mb-10 w-full max-w-sm" initial="h" animate="v">
          {blocks.map((b, i) => (
            <motion.rect key={i} x={b.x} y={b.y} height="18" width={b.w} rx="4" fill={b.c}
              variants={{ h: { opacity: 0, y: b.y + 10 }, v: { opacity: 1, y: b.y, transition: { delay: 0.2 + i * 0.07, duration: 0.7, ease } } }} />
          ))}
          <motion.rect x="42" y="22" height="18" width="30" rx="4" fill="#C8643B" opacity="0.0"
            animate={{ opacity: [0, 0, 1, 1, 0], x: [42, 42, 52, 52, 42] }} transition={{ duration: 6, repeat: Infinity, times: [0, 0.2, 0.35, 0.8, 1], ease: "easeInOut" }} />
        </motion.svg>
        <h2 className="h-display text-4xl text-ink xl:text-5xl">Fix the plan,<br />not the whole shop.</h2>
        <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-soft">
          When a machine goes down, ReSchedule moves only the jobs it has to. Nothing changes until a manager says yes.
        </p>
      </div>
      <ul className="relative z-10 space-y-2.5 text-sm text-soft">
        {["Sign in with Google, a WhatsApp code, or a password", "Every approval is logged with who and when", "Your job cards stay yours, delete them any time"].map((t) => (
          <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function AuthScreen({ mode: initial }: { mode: Mode }) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>(initial);
  const [step, setStep] = useState<Step>("form");
  const [method, setMethod] = useState<"password" | "code">("password");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", shop: "", email: "", phone: "", password: "", target: "", code: "", newPw: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => setMode(initial), [initial]);
  useEffect(() => {
    api<Cfg>("/auth/config").then(setCfg).catch(() => setCfg({ google: false, whatsapp: false, email: false, dev_codes: false }));
    if (hashQuery().get("error") === "google") setErr("Google sign-in did not complete. Please try again.");
  }, []);
  const reset = (m: Mode) => { setErr(null); setInfo(null); setDev(null); setStep("form"); setMode(m); go("/" + (m === "login" ? "login" : m)); };

  async function run(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try { await fn(); } catch (e) {
      const d = e instanceof ApiError ? e.detail : null;
      if (d?.code === "email_unverified") { setStep("code"); setMode("signup"); setInfo(d.message); setDev(d.dev_code ?? null); }
      else setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  }
  const done = (r: { user: User }) => { setUser(r.user); go("/app"); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login" && method === "password") done(await api("/auth/login", { body: { email: f.email, password: f.password } }));
      else if (mode === "login") {
        if (step === "form") {
          const r = await api("/auth/otp/request", { body: { target: f.target } });
          setDev(r.dev_code ?? null); setInfo(`If ${f.target} belongs to a team member, a code is on its way${r.channel === "whatsapp" ? " on WhatsApp" : " by email"}.`); setStep("code");
        } else done(await api("/auth/otp/verify", { body: { target: f.target, code: f.code } }));
      } else if (mode === "signup") {
        if (step === "form") {
          const r = await api("/auth/register", { body: { name: f.name, email: f.email, password: f.password, shop_name: f.shop, phone: f.phone || null } });
          setDev(r.dev_code ?? null); setInfo(`We sent a 6-digit code to ${f.email}.`); setStep("code");
        } else done(await api("/auth/verify-email", { body: { email: f.email, code: f.code } }));
      } else {
        if (step === "form") {
          const r = await api("/auth/password/forgot", { body: { email: f.email } });
          setDev(r.dev_code ?? null); setInfo("If that email has an account, a reset code is on its way."); setStep("code");
        } else {
          await api("/auth/password/reset", { body: { email: f.email, code: f.code, new_password: f.newPw } });
          reset("login"); setInfo("Password changed. Sign in with the new one.");
        }
      }
    });
  };

  const st = strength(mode === "signup" ? f.password : f.newPw);
  const title = mode === "signup" ? (step === "code" ? "Check your email." : "Set up your shop.") : mode === "forgot" ? "Reset your password." : step === "code" ? "Enter your code." : "Welcome back.";
  const cta = mode === "signup" ? (step === "form" ? "Create account" : "Verify and continue") : mode === "forgot" ? (step === "form" ? "Send reset code" : "Set new password") : method === "code" ? (step === "form" ? "Send code" : "Sign in") : "Sign in";

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_1fr]">
      <Brand />
      <div className="flex flex-col justify-center">
        <div className="mb-8 lg:hidden"><a href="#" onClick={() => (location.hash = "")}><Wordmark size={28} /></a></div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}
          className="rounded-[32px] border border-line bg-ivory p-7 shadow-card sm:p-10">
          <div className="eyebrow mb-3">{mode === "signup" ? "New shop" : mode === "forgot" ? "Account recovery" : "Sign in"}</div>
          <AnimatePresence mode="wait">
            <motion.h1 key={title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="h-display text-4xl text-ink">{title}</motion.h1>
          </AnimatePresence>

          {mode === "login" && step === "form" && (
            <div className="mt-7 grid grid-cols-2 gap-1 rounded-full border border-line bg-cream/60 p-1" role="tablist">
              {(["password", "code"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={method === m} type="button" onClick={() => { setMethod(m); setErr(null); }}
                  className="relative rounded-full px-4 py-2 text-sm font-medium text-ink">
                  {method === m && <motion.span layoutId="authTab" className="absolute inset-0 rounded-full bg-ivory shadow-card" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <span className="relative">{m === "password" ? "Password" : "WhatsApp or email code"}</span>
                </button>
              ))}
            </div>
          )}

          {mode !== "forgot" && step === "form" && (
            <div className="mt-6 rounded-2xl border border-terra/30 bg-terra/5 p-4">
              <DemoButton className="w-full [&>button]:w-full" onUser={setUser} />
              {cfg?.demo && <p className="mt-2 text-xs text-soft">No email or password. You get a private demo shop with 12 jobs, 5 machines, a live plan and a machine breakdown waiting for your decision.</p>}
            </div>
          )}

          <form onSubmit={submit} className="mt-7 grid gap-5" noValidate>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${mode}-${step}-${method}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.28, ease }} className="grid gap-5">
                {step === "code" ? (
                  <>
                    {info && <Alert tone="sage">{info}</Alert>}
                    {dev && <Alert tone="amber">Development mode: your code is <b className="font-mono tracking-widest">{dev}</b>. This is shown only when the server is not in production.</Alert>}
                    <Field label="6-digit code">
                      <Input value={f.code} onChange={set("code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                        className="!text-center font-mono !text-2xl tracking-[0.5em]" placeholder="······" />
                    </Field>
                    {mode === "forgot" && <Field label="New password" hint="At least 10 characters."><Input type="password" value={f.newPw} onChange={set("newPw")} autoComplete="new-password" /></Field>}
                  </>
                ) : mode === "signup" ? (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Your name"><Input value={f.name} onChange={set("name")} autoComplete="name" autoFocus /></Field>
                      <Field label="Shop name"><Input value={f.shop} onChange={set("shop")} autoComplete="organization" /></Field>
                    </div>
                    <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
                    <Field label="WhatsApp number (optional)" hint="Lets you sign in and get approval alerts on WhatsApp."><Input value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="+91 98765 43210" /></Field>
                    <Field label="Password" hint="At least 10 characters. Do not reuse one from another site.">
                      <Input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
                      <div className="mt-1 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream"><motion.div className="h-full rounded-full" animate={{ width: `${st.pct}%`, backgroundColor: st.color }} transition={{ duration: 0.4 }} /></div>
                        <span className="w-12 text-right font-mono text-[11px] text-soft">{f.password && st.label}</span>
                      </div>
                    </Field>
                  </>
                ) : mode === "forgot" ? (
                  <Field label="Account email"><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" autoFocus /></Field>
                ) : method === "password" ? (
                  <>
                    <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" autoFocus /></Field>
                    <Field label="Password"><Input type="password" value={f.password} onChange={set("password")} autoComplete="current-password" /></Field>
                  </>
                ) : (
                  <Field label="WhatsApp number or email" hint="Managers and operators added by the shop owner sign in this way."><Input value={f.target} onChange={set("target")} autoFocus placeholder="+91 98765 43210" /></Field>
                )}
              </motion.div>
            </AnimatePresence>

            {err && <Alert>{err}</Alert>}
            {!err && info && step === "form" && <Alert tone="sage">{info}</Alert>}
            <Button busy={busy} className="mt-1 w-full" type="submit">{cta}</Button>
            {step === "code" && <button type="button" onClick={() => { setStep("form"); setErr(null); }} className="text-center text-sm text-soft underline-offset-4 hover:text-ink hover:underline">Use a different {mode === "login" ? "number or email" : "email"}</button>}
          </form>

          {mode === "login" && step === "form" && cfg?.google && (
            <>
              <div className="my-6 flex items-center gap-4 text-xs text-soft"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
              <a href={`${API_BASE}/auth/google/start`} className="flex items-center justify-center gap-3 rounded-full border border-ink/20 px-6 py-3 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:bg-ink/5">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.7-6c-2.2 1.5-5 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
                Continue with Google
              </a>
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-soft">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => reset("forgot")} className="hover:text-ink hover:underline underline-offset-4">Forgot password?</button>
                <span>New shop? <button type="button" onClick={() => reset("signup")} className="font-medium text-terra hover:underline underline-offset-4">Create an account</button></span>
              </>
            ) : (
              <span>Already registered? <button type="button" onClick={() => reset("login")} className="font-medium text-terra hover:underline underline-offset-4">Sign in</button></span>
            )}
          </div>
        </motion.div>
        <p className="mt-5 text-center text-xs text-soft">ReSchedule is a prototype. By continuing you accept the <button type="button" className="underline underline-offset-4" onClick={() => openPolicy("terms")}>terms of use</button> and <button type="button" className="underline underline-offset-4" onClick={() => openPolicy("privacy")}>privacy policy</button>. <button type="button" className="underline underline-offset-4" onClick={() => openPolicy("data")}>Delete my data</button>.</p>
      </div>
    </div>
  );
}

export function Gate({ children, need }: { children: ReactNode; need?: string }) {
  const { user, loading, can } = useAuth();
  useEffect(() => { if (!loading && !user) go("/login"); }, [loading, user]);
  if (loading) return <div className="flex min-h-screen items-center justify-center text-soft"><Spinner size={26} /></div>;
  if (!user) return null;
  if (need && !can(need)) return <div className="p-10 text-center text-soft">Your role does not include this area.</div>;
  return <>{children}</>;
}
