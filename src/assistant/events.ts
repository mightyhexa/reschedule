/** Pages tell DuckMama what just happened without depending on her. */
export type DuckSignal = "approved" | "disruption";
export const duckSignal = (name: DuckSignal) => window.dispatchEvent(new CustomEvent("duckmama", { detail: name }));
