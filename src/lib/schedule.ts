// Illustrative instance used to explain the idea on the site.
// It is NOT benchmark data. Real results are loaded from /public/data/benchmark.json.

export const MACHINES = ["M1", "M2", "M3", "M4", "M5"] as const;
export const AXIS = 20; // hours shown on the time axis
export const NOW = 3; // hour at which the disruption happens
export const DUR = 3; // every operation lasts 3 h in the illustration

export type Scenario = "breakdown" | "rush" | "material";

export interface Placed {
  id: string;
  job: string;
  machine: number;
  from: number;
  to: number;
  dur: number;
  moved: boolean;
  added: boolean;
}

export interface Win {
  machine: number;
  from: number;
  to: number;
  kind: "down" | "material";
  label: string;
}

const ORIG: [string, number][][] = [
  [["A", 0], ["B", 3], ["C", 6], ["D", 9], ["E", 12]],
  [["C", 0], ["A", 3], ["E", 6], ["B", 9], ["D", 12]],
  [["B", 0], ["D", 3], ["A", 6], ["E", 9], ["C", 12]],
  [["D", 0], ["E", 3], ["B", 6], ["C", 9], ["A", 12]],
  [["E", 0], ["C", 3], ["D", 6], ["A", 9], ["B", 12]],
];

export const TOTAL_OPS = ORIG.reduce((n, row) => n + row.length, 0);

function mk(m: number, job: string, from: number, to: number, added = false): Placed {
  return {
    id: `${m}-${job}`,
    job,
    machine: m,
    from,
    to,
    dur: DUR,
    moved: !added && from !== to,
    added,
  };
}

export interface Built {
  windows: Win[];
  stable: Placed[];
  naive: Placed[];
  stableMoved: number;
  naiveMoved: number;
  total: number;
}

export function build(s: Scenario): Built {
  const windows: Win[] =
    s === "breakdown"
      ? [{ machine: 2, from: 3, to: 7, kind: "down", label: "M3 down" }]
      : s === "material"
        ? [{ machine: 1, from: 6, to: 9, kind: "material", label: "material late" }]
        : [];

  const stable: Placed[] = [];
  const naive: Placed[] = [];

  ORIG.forEach((ops, m) => {
    const fixed = ops.filter(([, st]) => st < NOW);
    const rest = ops.filter(([, st]) => st >= NOW);
    fixed.forEach(([j, st]) => {
      stable.push(mk(m, j, st, st));
      naive.push(mk(m, j, st, st));
    });

    // --- ReSchedule: smallest change that repairs the plan
    rest.forEach(([j, st]) => {
      let to = st;
      if (s === "breakdown" && m === 2) to = st + 4;
      if (s === "rush" && m === 1) to = st + 3;
      if (s === "material" && m === 1) {
        if (j === "E") to = 9;
        if (j === "B") to = 6;
      }
      stable.push(mk(m, j, st, to));
    });
    if (s === "rush" && m === 1) stable.push(mk(m, "R", NOW, NOW, true));

    // --- Rebuild from scratch: re-sequence everything not yet started
    const jobs = rest.map(([j, st]) => ({ j, st, add: false }));
    if (s === "rush" && m === 1) jobs.unshift({ j: "R", st: NOW, add: true });
    const k = s === "rush" && m === 1 ? 2 : s === "material" && m === 1 ? 2 : 1;
    const rot = jobs.slice(k).concat(jobs.slice(0, k));
    const base = s === "breakdown" && m === 2 ? 7 : NOW;
    rot.forEach((o, i) => {
      naive.push(mk(m, o.j, o.add ? NOW : o.st, base + DUR * i, o.add));
    });
  });

  return {
    windows,
    stable,
    naive,
    stableMoved: stable.filter((p) => p.moved).length,
    naiveMoved: naive.filter((p) => p.moved).length,
    total: TOTAL_OPS,
  };
}
