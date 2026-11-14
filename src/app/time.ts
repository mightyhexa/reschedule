// Plan time is "minutes after origin". origin is a shop-local clock string like 2026-11-10T09:30:00.
export const originMs = (origin: string) => new Date(origin).getTime();
export function clock(origin: string, min: number, withDay = false): string {
  const d = new Date(originMs(origin) + min * 60000);
  const t = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return withDay ? `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${t}` : t;
}
export function dayLabel(origin: string, min: number): string {
  return new Date(originMs(origin) + min * 60000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
export function dur(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
