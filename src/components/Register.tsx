import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Reveal } from "./Reveal";
import { API_BASE } from "../app/api";

interface Form {
  name: string;
  role: string;
  shop: string;
  cluster: string;
  machines: string;
  tool: string;
  contact: string;
  pain: string[];
  website: string; // honeypot, real people never fill it
}

const empty: Form = {
  name: "",
  role: "",
  shop: "",
  cluster: "Jeedimetla",
  machines: "5–10",
  tool: "Excel",
  contact: "",
  pain: [],
  website: "",
};
const pains = [
  "Machine breakdowns",
  "Rush orders",
  "Late material",
  "Operator absence",
];

const input =
  "w-full rounded-xl border border-line bg-cream/40 px-4 py-3 text-[15px] text-ink outline-none transition-all focus:border-terra focus:bg-ivory focus:shadow-[0_0_0_3px_rgba(200,100,59,0.18)]";

export function Register() {
  const [f, setF] = useState<Form>(empty);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState("");

  // Optional Cloudflare Turnstile: only active when the backend has it configured.
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/auth/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!live || !c?.turnstile_site_key) return;
        setSiteKey(c.turnstile_site_key);
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = () =>
          (window as any).turnstile?.render("#ts-box", { sitekey: c.turnstile_site_key, callback: (t: string) => setCaptcha(t) });
        document.head.appendChild(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const ok =
      /^\S+@\S+\.\S+$/.test(f.contact) || /^[+\d][\d\s-]{7,}$/.test(f.contact);
    if (!f.name.trim() || !f.shop.trim() || !ok) {
      setErr(
        "Please add your name, shop name, and a valid email or phone number."
      );
      return;
    }
    if (!consent) {
      setErr("Please tick the box so we can contact you about the pilot.");
      return;
    }
    if (siteKey && !captcha) {
      setErr("Please complete the check below.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/pilot`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "reschedule" },
        body: JSON.stringify({ ...f, turnstile: captcha || null }),
      });
      if (res.status === 429) throw new Error("Too many requests from this network. Please try again in a while.");
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        const msg = Array.isArray(d?.detail) ? d.detail.map((x: any) => String(x.msg).replace(/^Value error, /, "")).join(". ") : d?.detail;
        throw new Error(typeof msg === "string" ? msg : "Server rejected the request");
      }
      setDone(true);
    } catch (e2: any) {
      setErr(e2?.message && e2.message !== "Failed to fetch" ? e2.message : "Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="pilot" className="mx-auto max-w-6xl px-6 py-28">
      <div className="grid gap-14 md:grid-cols-[0.82fr_1.18fr]">
        <Reveal>
          <div className="mb-4 flex items-center gap-2.5 font-mono text-xs text-soft">
            <span className="text-terra">IX</span>
            <span>·</span>
            <span>Pilot access</span>
          </div>
          <h2 className="h-display text-4xl text-ink sm:text-5xl">
            Run it on your own job cards.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-soft">
            We are looking for a few 5 to 25 machine CNC and fabrication shops
            to try ReSchedule on real job cards. No sensors, no hardware, and no
            commitment.
          </p>

          <div className="mt-8 space-y-3 rounded-2xl border border-line bg-ivory/80 p-5">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-soft">Planned pilot tier</span>
              <span className="font-medium text-ink">₹2,999 / month</span>
            </div>
            <div className="h-px bg-line" />
            <p className="text-xs leading-relaxed text-soft">
              Your data stays yours, and nothing is applied to your plan without
              your approval.
            </p>
          </div>
        </Reveal>

        <Reveal
          delay={0.1}
          className="rounded-[32px] border border-line bg-ivory p-7 shadow-card md:p-10"
        >
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="ok"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-10 text-center"
              >
                <motion.svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  className="mx-auto"
                  initial="h"
                  animate="v"
                >
                  <motion.circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#7A8F6B"
                    strokeWidth="3"
                    variants={{ h: { pathLength: 0 }, v: { pathLength: 1 } }}
                    transition={{ duration: 0.7 }}
                  />
                  <motion.path
                    d="M20 33 l8 8 l16 -18"
                    fill="none"
                    stroke="#7A8F6B"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    variants={{ h: { pathLength: 0 }, v: { pathLength: 1 } }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  />
                </motion.svg>
                <h3 className="h-display mt-6 text-3xl text-ink">
                  Request received.
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-soft">
                  We will reach out about a pilot on your job cards.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={submit}
                className="grid gap-5"
                exit={{ opacity: 0 }}
                noValidate
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Your name
                    <input
                      className={input}
                      value={f.name}
                      onChange={set("name")}
                      autoComplete="name"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Role
                    <input
                      className={input}
                      value={f.role}
                      onChange={set("role")}
                      placeholder="Owner, planner, supervisor"
                    />
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Shop name
                  <input
                    className={input}
                    value={f.shop}
                    onChange={set("shop")}
                    autoComplete="organization"
                  />
                </label>
                <div className="grid gap-5 sm:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Cluster
                    <select
                      className={input}
                      value={f.cluster}
                      onChange={set("cluster")}
                    >
                      {["Jeedimetla", "Balanagar", "Sanathnagar", "Other"].map(
                        (c) => (
                          <option key={c}>{c}</option>
                        )
                      )}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Machines
                    <select
                      className={input}
                      value={f.machines}
                      onChange={set("machines")}
                    >
                      {["Under 5", "5–10", "11–25", "25+"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Plans in
                    <select
                      className={input}
                      value={f.tool}
                      onChange={set("tool")}
                    >
                      {["Excel", "Tally", "ERP", "Paper or whiteboard"].map(
                        (c) => (
                          <option key={c}>{c}</option>
                        )
                      )}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink">
                    What disrupts you most?
                  </legend>
                  <div className="flex flex-wrap gap-2.5">
                    {pains.map((p) => {
                      const on = f.pain.includes(p);
                      return (
                        <button
                          type="button"
                          key={p}
                          aria-pressed={on}
                          onClick={() =>
                            setF({
                              ...f,
                              pain: on
                                ? f.pain.filter((x) => x !== p)
                                : [...f.pain, p],
                            })
                          }
                          className={`rounded-full border px-4 py-2 text-sm transition-all duration-300 ${
                            on
                              ? "border-terra bg-terra text-ivory"
                              : "border-ink/20 hover:bg-ink/5"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Email or phone
                  <input
                    className={input}
                    value={f.contact}
                    onChange={set("contact")}
                    autoComplete="email"
                  />
                </label>
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={f.website}
                  onChange={set("website")}
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />
                <label className="flex items-start gap-3 text-sm text-soft">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#C8643B]" />
                  <span>
                    I agree to be contacted about a pilot and to the{" "}
                    <a href="#policies" className="underline underline-offset-4">data policy</a>.
                  </span>
                </label>
                {siteKey && <div id="ts-box" />}
                {err && (
                  <p role="alert" className="text-sm text-brick">
                    {err}
                  </p>
                )}
                <button
                  disabled={busy}
                  className="mt-1 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-ivory btn-fill disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Request pilot access"}
                </button>
                <p className="text-xs text-soft">
                  Your contact details are encrypted at rest. Already have an account?{" "}
                  <a href="#/login" className="underline underline-offset-4">Sign in</a>.
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </Reveal>
      </div>
    </section>
  );
}