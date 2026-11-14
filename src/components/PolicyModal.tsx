import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../app/api";

export type PolicyTab = "terms" | "privacy" | "data" | "prototype";
const EVT = "reschedule:policy";
/** Open the Terms, Privacy and Data Control window from anywhere (footer, sign-up, policies section). */
export const openPolicy = (tab: PolicyTab = "terms") => window.dispatchEvent(new CustomEvent(EVT, { detail: tab }));

const TABS: { id: PolicyTab; label: string }[] = [
  { id: "terms", label: "Terms of use" },
  { id: "privacy", label: "Privacy policy" },
  { id: "data", label: "Your data and deletion" },
  { id: "prototype", label: "Prototype notice" },
];

/** The "delete my pilot data" control: calls POST /pilot/forget. The server answers the same way whether or not a request matched. */
export function ForgetMe({ big = false }: { big?: boolean }) {
  const [v, setV] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  async function send() {
    setState("busy");
    try {
      const r = await fetch(`${API_BASE}/pilot/forget`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "reschedule" },
        body: JSON.stringify({ contact: v.trim() }),
      });
      setState(r.ok ? "done" : "err");
    } catch {
      setState("err");
    }
  }
  if (state === "done")
    return <p role="status" className="text-sm text-[#44563A]">Done. If a pilot request matched that email or number, it is now marked for deletion. For privacy we give the same answer either way.</p>;
  return (
    <div>
      <div className={`flex flex-col gap-2 ${big ? "sm:flex-row" : "sm:flex-row"}`}>
        <input value={v} onChange={(e) => { setV(e.target.value); if (state === "err") setState("idle"); }} placeholder="Email or phone you used on the pilot form" aria-label="Email or phone you used on the pilot form" maxLength={254}
          className="min-w-0 flex-1 rounded-full border border-line bg-cream/40 px-4 py-2.5 text-sm outline-none focus:border-terra" />
        <button onClick={send} disabled={v.trim().length < 5 || state === "busy"} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ivory disabled:opacity-50">
          {state === "busy" ? "Sending…" : "Delete My Pilot Data"}
        </button>
      </div>
      {state === "err" && <p role="alert" className="mt-2 text-xs text-brick">That did not go through (you may be sending too fast). Try again in a minute.</p>}
    </div>
  );
}

const H = ({ children }: { children: string }) => <h3 className="h-display mt-6 text-xl text-ink first:mt-0">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[14.5px] leading-relaxed text-soft">{children}</p>;

function Body({ tab }: { tab: PolicyTab }) {
  if (tab === "terms")
    return (
      <>
        <H>1. What this is</H>
        <P>ReSchedule is a prototype built by Fahad. It suggests repairs to a CNC shop schedule. It is provided as is, without any promise that it is accurate, always available, or fit for running a real factory.</P>
        <H>2. You stay in charge</H>
        <P>Every suggested plan is a draft. Nothing changes on the shop floor until a manager or owner approves it. Check each plan before you act on it. You are responsible for what you do with it.</P>
        <H>3. What you may upload</H>
        <P>Job cards and machine names for your own shop. Do not upload personal data about people, passwords, or anything you do not have the right to share. Do not try to break, overload or probe the service.</P>
        <H>4. Your data is yours</H>
        <P>You keep ownership of everything you upload. We use it only to build and repair your schedules. You can export it or delete it yourself, see "Your data and deletion".</P>
        <H>5. Fair use and changes</H>
        <P>We limit how fast the service can be used, and we may change it, reset it or stop it at any time, including deleting demo workspaces after 24 hours.</P>
        <H>6. Contact</H>
        <P>Use the pilot form on this page.</P>
      </>
    );
  if (tab === "privacy")
    return (
      <>
        <H>What we collect</H>
        <P>Pilot form: name, role, shop name, cluster, machine count, and a contact (email or phone). Account: name, email and/or phone, a password stored only as a one-way hash, and sign-in history. Shop data: machines, job cards, plans, disruptions and an audit log of who approved what, with their IP address.</P>
        <H>How we protect it</H>
        <P>Contact details are encrypted in the database. Sessions use secure, HttpOnly cookies. There are no advertising trackers and no analytics cookies.</P>
        <H>Who else sees it</H>
        <P><b>DuckMama chat:</b> what you type to the duck is sent to Google's Gemini service to write the reply, along with a short summary of your shop when you are signed in. Do not type secrets into it. Google's own terms apply to that processing, and on free plans Google may use prompts to improve its products. Sign-in codes go through our email and WhatsApp providers. If a bot check is switched on, Cloudflare Turnstile sees your browser.</P>
        <H>What we do not do</H>
        <P>We do not sell your data. We do not use your job cards to train models.</P>
        <H>How long we keep it</H>
        <P>Until you delete it. Demo workspaces are deleted automatically after 24 hours. If the operator keeps nightly backups, they are rotated after 14 days, so a deletion fully clears within that window.</P>
        <H>Chat history</H>
        <P>DuckMama's conversation is kept in your browser tab only. It is not stored on our server.</P>
      </>
    );
  if (tab === "prototype")
    return (
      <>
        <H>Please read this before you rely on it</H>
        <P>ReSchedule is a prototype built for a hackathon. Numbers shown on the home page come from a synthetic benchmark shop and are labelled as such. Results on a real shop will differ.</P>
        <P>The planner finds a good fix quickly, but it can fall back to a simpler "push everything later" plan when it runs out of time. The screen tells you when that happens.</P>
        <P>Do not use it as the only safeguard for safety-critical or contractual decisions.</P>
      </>
    );
  return (
    <>
      <H>Delete my pilot data</H>
      <P>Sent a pilot request? Enter the email or phone you used and we mark that request for deletion.</P>
      <div className="mt-3"><ForgetMe big /></div>
      <H>Delete my workspace and everything in it</H>
      <P>Signed in as the owner? Open <a className="text-terra underline underline-offset-4" href="#/app/account" onClick={() => window.dispatchEvent(new CustomEvent(EVT, { detail: null }))}>Account</a>. There you can download everything we hold as one file, and permanently delete your shop, people, job cards, plans and audit trail.</P>
      <H>Demo workspaces</H>
      <P>The one-click demo shop is private to your browser and is deleted automatically after 24 hours.</P>
    </>
  );
}

export function PolicyModal() {
  const [tab, setTab] = useState<PolicyTab | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent).detail as PolicyTab | null;
      if (t === null) return setTab(null);
      back.current = document.activeElement;
      setTab(t);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  useEffect(() => {
    if (!tab) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setTab(null);
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
      (back.current as HTMLElement | null)?.focus?.();
    };
  }, [tab === null]);

  return (
    <AnimatePresence>
      {tab && (
        <motion.div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setTab(null)}>
          <motion.div role="dialog" aria-modal="true" aria-label="Terms, privacy and data control"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-line bg-ivory shadow-lift sm:rounded-[28px]"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <div className="eyebrow">Governance</div>
                <div className="h-display text-2xl text-ink">Terms, privacy and data control</div>
              </div>
              <button ref={close} onClick={() => setTab(null)} aria-label="Close" className="rounded-full border border-line px-3.5 py-1.5 text-sm text-soft hover:text-ink">Close ✕</button>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-line px-4 py-2" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${tab === t.id ? "bg-ink text-ivory" : "text-soft hover:text-ink"}`}>{t.label}</button>
              ))}
            </div>
            <div data-lenis-prevent className="overflow-y-auto px-6 py-6"><Body tab={tab} /></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
