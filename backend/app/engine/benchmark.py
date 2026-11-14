"""Reproducible benchmark: five strategies face identical seeded disruptions on synthetic job shops.

    python -m app.engine.benchmark --traces 30 --budget 2 --seed 42 --out ../public/data/benchmark.json

Strategies: fcfs, edd, right_shift (dispatch rules), global_cpsat (full re-solve, no stability), reschedule
(repair with frozen horizon and a stability penalty). Metric definitions live in scheduler.evaluate().
"""
from __future__ import annotations

import argparse
import json
import random
import statistics as st
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from .model import JobIn, OpIn, Window
from .scheduler import dispatch, evaluate, solve

ENGINE_VERSION = "0.2.0"
SIZES = [(10, 5), (30, 10), (60, 15)]
LAMBDAS = [0.0, 0.25, 0.5, 0.75, 1.0]
STRATS = [("fcfs", "FCFS dispatch"), ("edd", "EDD dispatch"), ("right_shift", "Right-shift"),
          ("global_cpsat", "Global CP-SAT re-solve"), ("reschedule", "ReSchedule")]
KEYS = ("on_time_pct", "moved_pct", "changeover_min", "energy_cost", "replan_s", "recovery_min")
FREEZE, DEFAULT_LAMBDA = 60, 0.5


def label(n: int, m: int) -> str:
    return f"{n} jobs / {m} machines"


def make_instance(rng: random.Random, n_jobs: int, n_mach: int):
    machines = [f"M{i + 1}" for i in range(n_mach)]
    jobs, ops = [], []
    work = 0
    for i in range(n_jobs):
        code = f"J{i + 1:03d}"
        n_ops = rng.randint(2, 4)
        seq_ops = []
        for s in range(n_ops):
            elig = rng.sample(machines, rng.randint(1, min(3, n_mach)))
            d = rng.randint(20, 110)
            seq_ops.append((s + 1, elig, d))
            work += d
        jobs.append((code, sum(d for _, _, d in seq_ops), rng.randint(1, 3), rng.choice(["steel", "alloy", "brass"])))
        ops.append((code, seq_ops))
    load = work / n_mach
    J, O = [], []
    for code, total, pr, fam in jobs:
        due = int(total * 1.25 + load * rng.uniform(0.55, 1.15))
        J.append(JobIn(code, due, pr, 0, fam))
    for code, seq_ops in ops:
        for s, elig, d in seq_ops:
            O.append(OpIn(f"{code}#{s}", code, s, elig, d))
    return J, O, machines, load


def disruption(rng: random.Random, jobs, ops, machines, base, load):
    now = int(rng.uniform(0.2, 0.45) * load)
    kind = rng.choice(["breakdown", "rush", "material"])
    windows: list[Window] = []
    extra_j, extra_o = [], []
    if kind == "breakdown":
        busy = [p.machine for p in base.values() if p.end > now]
        mc = rng.choice(busy or machines)
        windows.append(Window(mc, now, now + int(rng.uniform(0.15, 0.35) * load) + 30, "down", f"{mc} down"))
    elif kind == "rush":
        d = rng.randint(60, 180)
        extra_j.append(JobIn("RUSH", now + d + rng.randint(60, 180), 1, now, ""))
        extra_o.append(OpIn("RUSH#1", "RUSH", 1, [rng.choice(machines)], d))
    else:
        cand = [j for j in jobs if min(p.start for p in base.values() if p.job == j.id) >= now]
        if cand:
            j = rng.choice(cand)
            j.release = now + int(rng.uniform(0.2, 0.4) * load) + 20
    return now, kind, windows, extra_j, extra_o


def run_trace(args):
    n_jobs, n_mach, seed, budget, lambdas = args
    rng = random.Random(seed)
    jobs, ops, machines, load = make_instance(rng, n_jobs, n_mach)
    fam = {j.id: j.family for j in jobs}
    b = solve(jobs, ops, machines, time_limit=max(budget, 2.0), seed=1, workers=1)
    base = {p.op_id: p for p in b.placed}
    # the disruption mutates jobs/ops, so each strategy gets a fresh deep-ish copy
    def fresh():
        import copy
        return copy.deepcopy(jobs), copy.deepcopy(ops)
    j0, o0 = fresh()
    now, kind, windows, ej, eo = disruption(rng, j0, o0, machines, base, load)
    rel = {j.id: j.release for j in j0}
    out: dict = {"kind": kind, "strategies": {}, "frontier": {}}

    def prep():
        j, o = fresh()
        for x in j:
            x.release = rel[x.id]
        return j + [copy_job(e) for e in ej], o + [copy_op(e) for e in eo]

    def metrics(res, jj):
        ev = evaluate(jj, res.placed, base, now, {**fam, "RUSH": ""}, disruption_t=now)
        return {"on_time_pct": ev["on_time_pct"], "moved_pct": ev["moved_pct"], "changeover_min": ev["changeover_min"],
                "energy_cost": ev["energy_cost"], "replan_s": round(res.wall_s, 3), "recovery_min": ev["recovery_min"]}

    for sid in ("fcfs", "edd", "right_shift"):
        jj, oo = prep()
        res = dispatch(jj, oo, machines, now=now, baseline=base, windows=[Window(**w.__dict__) for w in windows], rule=sid)
        out["strategies"][sid] = metrics(res, jj)
    jj, oo = prep()
    res = solve(jj, oo, machines, now=now, baseline=base, windows=[Window(**w.__dict__) for w in windows], freeze_min=0,
                move_penalty=0, time_limit=budget, seed=1, workers=1)
    out["strategies"]["global_cpsat"] = metrics(res, jj)
    for lam in lambdas:
        jj, oo = prep()
        res = solve(jj, oo, machines, now=now, baseline=base, windows=[Window(**w.__dict__) for w in windows], freeze_min=FREEZE,
                    move_penalty=lam * 60.0, time_limit=budget, seed=1, workers=1)
        m = metrics(res, jj)
        out["frontier"][str(lam)] = m
        if lam == DEFAULT_LAMBDA:
            out["strategies"]["reschedule"] = m
    return n_jobs, out


def copy_job(j: JobIn) -> JobIn:
    return JobIn(j.id, j.due, j.priority, j.release, j.family)


def copy_op(o: OpIn) -> OpIn:
    return OpIn(o.id, o.job, o.seq, list(o.elig), o.dur)


def mean(vals):
    v = [x for x in vals if x is not None]
    return round(st.mean(v), 2) if v else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--traces", type=int, default=30)
    ap.add_argument("--budget", type=float, default=2.0)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--frontier-traces", type=int, default=10, help="traces per size that also sweep every lambda")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--out", default="../public/data/benchmark.json")
    a = ap.parse_args()
    jobs_args = []
    for si, (n, m) in enumerate(SIZES):
        for t in range(a.traces):
            lams = LAMBDAS if t < a.frontier_traces else [DEFAULT_LAMBDA]
            jobs_args.append((n, m, a.seed * 100000 + si * 1000 + t, a.budget, lams))
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        results = list(ex.map(run_trace, jobs_args))
    by_size: dict[int, list[dict]] = {}
    for n, r in results:
        by_size.setdefault(n, []).append(r)

    def table(rs):
        return [{"id": sid, "label": lab, "metrics": {k: mean([r["strategies"][sid][k] for r in rs]) for k in KEYS}} for sid, lab in STRATS]

    head_n = SIZES[1][0]  # headline numbers: 30 jobs / 10 machines
    frontier = []
    fr_rows = [r for rs in by_size.values() for r in rs if str(0.0) in r["frontier"] and len(r["frontier"]) == len(LAMBDAS)]
    for lam in LAMBDAS:
        ms = [r["frontier"][str(lam)] for r in fr_rows]
        frontier.append({"lambda": lam, "on_time_pct": mean([x["on_time_pct"] for x in ms]),
                         "energy_cost": mean([x["energy_cost"] for x in ms]), "changeover_min": mean([x["changeover_min"] for x in ms]),
                         "moved_pct": mean([x["moved_pct"] for x in ms])})
    out = {
        "status": "measured",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "engine_version": ENGINE_VERSION,
        "protocol": {"instance_sizes": [label(*s) for s in SIZES], "traces_per_size": a.traces, "time_budget_s": a.budget, "seed": a.seed},
        "headline_size": label(*SIZES[1]),
        "strategies": table(by_size[head_n]),
        "by_size": {label(n, m): table(by_size[n]) for n, m in SIZES},
        "frontier": frontier,
        "notes": {
            "frontier": f"Averaged over {len(fr_rows)} traces across all sizes (first {a.frontier_traces} per size).",
            "reschedule": f"Repair with a {FREEZE}-minute frozen horizon and lambda={DEFAULT_LAMBDA} (one moved operation is worth {DEFAULT_LAMBDA * 60:.0f} weighted lateness minutes).",
            "recovery_min": "Minutes from the disruption until the last moved or added operation completes.",
            "energy_cost": "Reported, not optimised: operation hours x 20 kW x tariff (INR 6/kWh, INR 9/kWh from 18:00 to 22:00).",
            "changeover_min": "Reported, not optimised: 10 minutes whenever consecutive operations on a machine change product family.",
            "solver": "OR-Tools CP-SAT, 1 worker per solve; the time budget is a limit, not proof of optimality.",
            "runtime_s": round(time.time() - t0),
        },
    }
    p = Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=2))
    print(f"wrote {p} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
