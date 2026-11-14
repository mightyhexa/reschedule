import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { ago } from "../time";
import { Alert, Badge, Button, Card, Field, Input, Loading, Page, Title, ease, inputCls, useToast } from "../ui";

interface Member { id: string; name: string; email: string | null; phone: string | null; role: string; active: boolean; last_login_at: string | null }
const roleHelp: Record<string, string> = {
  manager: "Approves plan changes. Signs in with WhatsApp or Google.",
  planner: "Uploads job cards and reports disruptions, but cannot approve.",
  operator: "Read-only view of the plan on the shop floor.",
};

export function TeamPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ team: Member[] }>("/team");
  const [f, setF] = useState({ name: "", phone: "", email: "", role: "manager" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/team", { method: "POST", body: { name: f.name, phone: f.phone || null, email: f.email || null, role: f.role } });
      toast(`${f.name} was added`);
      setF({ name: "", phone: "", email: "", role: "manager" });
      reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function patch(id: string, body: object) {
    try {
      await api(`/team/${id}`, { method: "PATCH", body });
      reload();
    } catch (e2) {
      toast((e2 as Error).message, "brick");
    }
  }

  return (
    <Page>
      <Title eyebrow={user?.shop.name} title="Your team" />
      <Card>
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {data?.team.map((m) => (
              <motion.li key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className={`flex flex-wrap items-center justify-between gap-4 py-4 ${m.active ? "" : "opacity-50"}`}>
                <div>
                  <div className="font-medium">{m.name}{m.id === user?.id && <span className="ml-2 text-xs text-soft">(you)</span>}</div>
                  <div className="mt-0.5 font-mono text-xs text-soft">{[m.phone, m.email].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-soft">{m.last_login_at ? `seen ${ago(m.last_login_at)}` : "never signed in"}</span>
                  {m.role === "owner" || !can("team") || m.id === user?.id ? (
                    <Badge tone={m.role === "owner" ? "ink" : "soft"}>{m.role}</Badge>
                  ) : (
                    <>
                      <select aria-label={`Role of ${m.name}`} className={`${inputCls} !w-auto !py-1.5 !text-sm`} value={m.role} onChange={(e) => patch(m.id, { role: e.target.value })}>
                        {["manager", "planner", "operator"].map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <Button variant={m.active ? "danger" : "ghost"} small onClick={() => patch(m.id, { active: !m.active })}>{m.active ? "Remove access" : "Restore"}</Button>
                    </>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>

      {can("team") && (
        <Card className="mt-6">
          <h2 className="h-display text-2xl">Add a manager or teammate</h2>
          <p className="mt-2 max-w-xl text-sm text-soft">They sign in with a one-time code sent to their WhatsApp number (or email). No password to remember.</p>
          <form onSubmit={invite} className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Name"><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Role" hint={roleHelp[f.role]}>
              <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {["manager", "planner", "operator"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="WhatsApp number" hint="With country code, or 10 digits for India."><Input type="tel" autoComplete="off" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 98765 43210" /></Field>
            <Field label="Email (optional)"><Input type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              {err && <div className="mb-4"><Alert>{err}</Alert></div>}
              <Button busy={busy} disabled={!f.name || (!f.phone && !f.email)}>Add to team</Button>
            </div>
          </form>
        </Card>
      )}
    </Page>
  );
}
