import { useState } from "react";
import { api, downloadUrl } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { ago } from "../time";
import { Alert, Badge, Button, Card, Field, Input, Loading, Page, Title, useToast } from "../ui";

interface Sess { id: string; method: string; user_agent: string; created_at: string; last_used_at: string; current: boolean }

function device(ua: string): string {
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${br} on ${os}`;
}

export function AccountPage() {
  const { user, logout, can } = useAuth();
  const toast = useToast();
  const sess = useApi<{ sessions: Sess[] }>("/auth/sessions");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;

  async function revoke(id: string) {
    try {
      await api(`/auth/sessions/${id}`, { method: "DELETE" });
      sess.reload();
    } catch (e) {
      toast((e as Error).message, "brick");
    }
  }
  async function all() {
    await api("/auth/logout-all", { method: "POST" });
    location.hash = "#/login";
    location.reload();
  }
  async function wipe() {
    setBusy(true);
    setErr(null);
    try {
      await api("/me/delete-shop", { method: "POST", body: { confirm_name: confirm } });
      location.hash = "";
      location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page>
      <Title eyebrow={user.shop.name} title="Account and data" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="h-display text-2xl">You</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-soft">Name</dt><dd>{user.name}</dd></div>
            {user.email && <div className="flex justify-between"><dt className="text-soft">Email</dt><dd className="font-mono text-xs">{user.email} {user.email_verified ? <Badge tone="sage">verified</Badge> : <Badge tone="amber">not verified</Badge>}</dd></div>}
            {user.phone && <div className="flex justify-between"><dt className="text-soft">WhatsApp</dt><dd className="font-mono text-xs">{user.phone}</dd></div>}
            <div className="flex justify-between"><dt className="text-soft">Role</dt><dd><Badge tone="ink">{user.role}</Badge></dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="ghost" small onClick={logout}>Sign out</Button>
            <Button variant="danger" small onClick={all}>Sign out everywhere</Button>
          </div>
        </Card>

        <Card>
          <h2 className="h-display text-2xl">Signed-in devices</h2>
          {sess.loading ? <Loading /> : (
            <ul className="mt-4 divide-y divide-line text-sm">
              {sess.data?.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">{device(s.user_agent)} {s.current && <Badge tone="sage">this device</Badge>}</div>
                    <div className="text-xs text-soft">via {s.method} · active {ago(s.last_used_at)}</div>
                  </div>
                  {!s.current && <Button variant="ghost" small onClick={() => revoke(s.id)}>Sign out</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="h-display text-2xl">Your data</h2>
          <p className="mt-2 max-w-2xl text-sm text-soft">Your job cards stay yours. We use them only to build your plans, never to train models, and we never sell them. You can take a copy or remove everything at any time.</p>
          <div className="mt-5"><a href={downloadUrl("/me/export")} className="inline-flex rounded-full border border-ink/20 px-5 py-2.5 text-sm transition-colors hover:bg-ink/5">Download everything as JSON</a></div>
          {can("shop") && (
            <div className="mt-8 rounded-2xl border border-brick/30 bg-brick/5 p-5">
              <h3 className="font-medium text-brick">Delete this shop</h3>
              <p className="mt-1 text-sm text-soft">Removes the shop, every team member, job cards, plans and the activity log. This cannot be undone.</p>
              <div className="mt-4 grid max-w-md gap-3">
                <Field label={`Type "${user.shop.name}" to confirm`}><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
                {err && <Alert>{err}</Alert>}
                <div><Button variant="danger" busy={busy} disabled={confirm.trim() !== user.shop.name} onClick={wipe}>Delete everything</Button></div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
