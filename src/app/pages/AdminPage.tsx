import { motion } from "framer-motion";
import { api } from "../api";
import { useApi } from "../hooks";
import { ago } from "../time";
import { Alert, Badge, Button, Card, Empty, Loading, Page, Title, ease, inputCls, useToast } from "../ui";

interface Pilot { id: string; name: string; role: string; shop: string; cluster: string; machines: string; tool: string; pain: string[]; contact: string; status: string; created_at: string }
const tones: Record<string, "soft" | "amber" | "sage" | "brick" | "terra"> = { new: "terra", contacted: "amber", pilot: "sage", declined: "soft", deletion_requested: "brick" };

export function AdminPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ pilots: Pilot[] }>("/admin/pilots");
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const rows = data?.pilots ?? [];
  async function status(id: string, s: string) {
    try { await api(`/admin/pilots/${id}`, { method: "PATCH", body: { status: s } }); reload(); } catch (e) { toast((e as Error).message, "brick"); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this pilot request permanently?")) return;
    try { await api(`/admin/pilots/${id}`, { method: "DELETE" }); toast("Deleted"); reload(); } catch (e) { toast((e as Error).message, "brick"); }
  }
  return (
    <Page>
      <Title eyebrow="Staff only" title="Pilot requests"><Badge tone="soft">{rows.length} total</Badge></Title>
      {rows.length === 0 ? <Empty title="No requests yet">They appear here when someone fills in the form on the site.</Empty> : (
        <div className="grid gap-4">
          {rows.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.45, ease }}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3"><span className="h-display text-xl">{p.shop}</span><Badge tone={tones[p.status] ?? "soft"}>{p.status.replace("_", " ")}</Badge></div>
                    <div className="mt-1 text-sm text-soft">{p.name}{p.role && ` · ${p.role}`} · {p.cluster} · {p.machines} machines · plans in {p.tool}</div>
                    <div className="mt-2 font-mono text-xs">{p.contact}</div>
                    {p.pain.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{p.pain.map((x) => <Badge key={x}>{x}</Badge>)}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-soft">{ago(p.created_at)}</span>
                    <select aria-label="Status" className={`${inputCls} !w-auto !py-1.5 !text-sm`} value={p.status === "deletion_requested" ? "declined" : p.status} onChange={(e) => status(p.id, e.target.value)}>
                      {["new", "contacted", "pilot", "declined"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <Button variant="danger" small onClick={() => remove(p.id)}>Delete</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </Page>
  );
}
