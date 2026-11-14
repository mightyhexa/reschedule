import { API_BASE } from "../app/api";

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}
export interface Handlers {
  onMeta: (m: { mood?: string; costume?: string; action?: unknown }) => void;
  onDelta: (t: string) => void;
  onCard: (c: any) => void;
  onAction: (a: unknown) => void;
  onDone: () => void;
  onError: (code: string, detail?: string) => void;
}

/** Streams one reply. Server-sent events over fetch (cookies and the CSRF header ride along). */
export async function streamChat(body: { messages: ChatTurn[]; page: string }, h: Handlers, signal: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/assistant/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "reschedule" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name !== "AbortError") h.onError("network");
    return;
  }
  if (res.status === 429) return h.onError("rate");
  if (!res.ok || !res.body) return h.onError("failed");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ended = false;
  const handle = (block: string) => {
    if (!block.startsWith("data:")) return;
    let ev: any;
    try {
      ev = JSON.parse(block.slice(5).trim());
    } catch {
      return;
    }
    if (ev.t === "meta") h.onMeta(ev);
    else if (ev.t === "delta") h.onDelta(String(ev.text ?? ""));
    else if (ev.t === "card") h.onCard(ev);
    else if (ev.t === "action") h.onAction(ev.action);
    else if (ev.t === "done") {
      ended = true;
      h.onDone();
    } else if (ev.t === "error") {
      ended = true;
      h.onError(String(ev.code ?? "failed"), typeof ev.detail === "string" ? ev.detail : undefined);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        handle(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
    if (buf.trim()) handle(buf.trim());
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    if (!ended) h.onError("network");
    return;
  }
  if (!ended) h.onError("failed");
}

const IN_CHARACTER: Record<string, string> = {
  offline: "Mama's phone line isn't hooked up yet. Whoever runs this shop needs to add the Gemini key.",
  rate: "Easy, boss, that's too many messages. Give me a minute to catch my breath.",
  busy: "Lot of chatter on the floor right now. Try me again in ten seconds.",
  auth: "Mama can't reach her brain. The API key looks wrong or expired.",
  network: "Signal dropped. Check your connection and ask me again.",
  empty: "I lost my train of thought. Ask me once more.",
  failed: "Something slipped on the line. Try that again.",
};
export const errorLine = (code: string) => IN_CHARACTER[code] ?? IN_CHARACTER.failed;
