"""Schedule construction and repair.

solve()    CP-SAT model: flexible job shop with precedence, machine no-overlap, downtime windows,
           late-material release times, a frozen horizon and a stability (move) penalty.
dispatch() FCFS / EDD / right-shift heuristics used as baselines and as a safety fallback.
"""
from __future__ import annotations

import time
from collections import defaultdict

from ortools.sat.python import cp_model

from .model import (CHANGEOVER_MIN, KW_PER_MACHINE, RATE_NORMAL, RATE_PEAK, TARIFF_PEAK, JobIn, OpIn, Placed,
                    SolveResult, Window)


# --------------------------------------------------------------------------- classification
def _overlaps(w: Window, s: int, e: int) -> bool:
    return s < w.end and w.start < e


def classify(ops: list[OpIn], baseline: dict[str, Placed] | None, now: int, windows: list[Window], freeze_min: int,
             extend: dict[str, int] | None = None, thaw: set[str] | None = None):
    """Split operations into fixed (done / running / frozen) and free.

    Returns (fixed: dict[op_id, Placed], free: list[OpIn], preempted: dict[op_id, remaining_min])."""
    fixed: dict[str, Placed] = {}
    free: list[OpIn] = []
    pre: dict[str, int] = {}
    if not baseline:
        return fixed, list(ops), pre
    down = [w for w in windows if w.kind == "down"]
    extend = extend or {}
    busy: dict[str, int] = {}  # machine -> time until which an overrunning operation occupies it
    for op in ops:
        b = baseline.get(op.id)
        if b is not None and op.id in extend and b.start < now < b.end:
            busy[b.machine] = max(busy.get(b.machine, 0), b.end + extend[op.id])
    for op in ops:
        b = baseline.get(op.id)
        if b is None:
            free.append(op)
        elif b.end <= now:
            fixed[op.id] = Placed(op.id, op.job, op.seq, b.machine, b.start, b.end, state="done")
        elif b.start < now:  # running right now
            if any(w.machine == b.machine and w.start <= now < w.end for w in down):
                pre[op.id] = b.end - now + extend.get(op.id, 0)  # machine broke under it: finish the rest after repair
                free.append(op)
            elif op.id in extend:  # it is running and will take longer: keep it on its machine, longer
                pre[op.id] = b.end - now + extend[op.id]
                free.append(op)
            else:
                fixed[op.id] = Placed(op.id, op.job, op.seq, b.machine, b.start, b.end, state="running")
        elif (b.start < now + freeze_min and op.id not in extend and op.job not in (thaw or ()) and not (b.machine in busy and b.start < busy[b.machine])
              and not any(w.machine == b.machine and _overlaps(w, b.start, b.end) for w in down)):
            fixed[op.id] = Placed(op.id, op.job, op.seq, b.machine, b.start, b.end, state="frozen")
        else:
            free.append(op)
    # A frozen step cannot stay put if a step before it in the same job was displaced (a machine broke under it, a
    # material delay, a longer run): release it too, so the job's steps stay in order.
    by_job: dict[str, list[OpIn]] = {}
    for op in ops:
        by_job.setdefault(op.job, []).append(op)
    for steps in by_job.values():
        steps.sort(key=lambda o: o.seq)
        lost = False
        for op in steps:
            if op.id not in fixed:
                lost = True
            elif lost and fixed[op.id].state == "frozen":
                del fixed[op.id]
                free.append(op)
    return fixed, free, pre


def _mark(placed: list[Placed], baseline: dict[str, Placed] | None) -> None:
    for p in placed:
        b = (baseline or {}).get(p.op_id)
        if b is None:
            p.added = baseline is not None and p.state == "planned"
            continue
        p.old_machine, p.old_start = b.machine, b.start
        if p.state in ("planned", "frozen"):
            p.moved = (p.machine, p.start) != (b.machine, b.start)
        elif p.state == "running":
            p.moved = False


# --------------------------------------------------------------------------- CP-SAT
def solve(jobs: list[JobIn], ops: list[OpIn], machines: list[str], *, now: int = 0,
          baseline: dict[str, Placed] | None = None, windows: list[Window] | None = None,
          freeze_min: int = 0, move_penalty: float = 20.0, time_limit: float = 2.0,
          seed: int = 1, workers: int = 4, extend: dict[str, int] | None = None, thaw: set[str] | None = None) -> SolveResult:
    t0 = time.perf_counter()
    windows = list(windows or [])
    jobmap = {j.id: j for j in jobs}
    by_job: dict[str, list[OpIn]] = defaultdict(list)
    for o in ops:
        by_job[o.job].append(o)
    for v in by_job.values():
        v.sort(key=lambda o: o.seq)

    fixed, free, pre = classify(ops, baseline, now, windows, freeze_min, extend, thaw)
    # An operator absence lets the running operation finish; the gap starts when it ends.
    for w in windows:
        if w.kind == "absent":
            ends = [f.end for f in fixed.values() if f.machine == w.machine and f.end > now and f.start < now]
            if ends:
                w.start = max(w.start, max(ends))
    free_dur = {o.id: pre.get(o.id, o.dur) for o in free}
    free_elig = {o.id: ([baseline[o.id].machine] if o.id in pre else list(dict.fromkeys(o.elig))) for o in free}

    H = (max([now] + [f.end for f in fixed.values()] + [w.end for w in windows])
         + sum(free_dur.values()) + max([0] + [j.release for j in jobs]) + 1)
    m = cp_model.CpModel()
    start: dict[str, cp_model.IntVar] = {}
    lit: dict[tuple[str, str], cp_model.IntVar] = {}
    on_machine: dict[str, list] = defaultdict(list)

    for f in fixed.values():
        if f.end > now:
            on_machine[f.machine].append(m.NewIntervalVar(f.start, f.end - f.start, f.end, f"fx_{f.op_id}"))
    for w in windows:
        if w.end > max(now, w.start):
            s = max(now, w.start)
            on_machine[w.machine].append(m.NewIntervalVar(s, w.end - s, w.end, f"win_{w.machine}_{w.start}"))

    for o in free:
        jo = by_job[o.job]
        i = jo.index(o)
        first_free = i == 0 or jo[i - 1].id in fixed
        lo = max(now, jobmap[o.job].release if first_free else now)
        s = m.NewIntVar(lo, H, f"s_{o.id}")
        start[o.id] = s
        if extend and o.id in extend and o.id in pre:
            m.Add(s == now)  # a job that is running cannot pause: it just runs longer
        d = free_dur[o.id]
        lits = []
        for mc in free_elig[o.id]:
            if mc not in machines:
                continue
            l = m.NewBoolVar(f"l_{o.id}_{mc}")
            lit[(o.id, mc)] = l
            lits.append(l)
            on_machine[mc].append(m.NewOptionalIntervalVar(s, d, s + d, l, f"i_{o.id}_{mc}"))
        if not lits:
            raise ValueError(f"Operation {o.id} has no valid machine")
        m.AddExactlyOne(lits)
    for mc, ivs in on_machine.items():
        m.AddNoOverlap(ivs)

    def end_of(op: OpIn):
        if op.id in fixed:
            return fixed[op.id].end
        return start[op.id] + free_dur[op.id]

    for jid, jops in by_job.items():
        for a, b in zip(jops, jops[1:]):
            if b.id in start:
                m.Add(start[b.id] >= end_of(a))

    terms = []
    ends = []
    for jid, jops in by_job.items():
        last = jops[-1]
        e = end_of(last)
        if not isinstance(e, int):
            ev = m.NewIntVar(now, H, f"e_{jid}")
            m.Add(ev == e)
            ends.append(ev)
        else:
            ends.append(e)
        j = jobmap[jid]
        if j.due is not None and not (last.id in fixed and fixed[last.id].end <= j.due):
            tard = m.NewIntVar(0, H, f"t_{jid}")
            m.Add(tard >= e - j.due)
            terms.append(10 * j.weight * tard)
    mk = m.NewIntVar(0, H, "makespan")
    for e in ends:
        m.Add(mk >= e)
    terms.append(mk)

    lam = int(round(10 * move_penalty))
    if baseline and lam > 0:
        for o in free:
            b = baseline.get(o.id)
            if b is None or o.id in pre or (o.id, b.machine) not in lit:
                continue
            eq = m.NewBoolVar(f"eq_{o.id}")
            m.Add(start[o.id] == b.start).OnlyEnforceIf(eq)
            same = m.NewBoolVar(f"same_{o.id}")
            m.AddImplication(same, eq)
            m.AddImplication(same, lit[(o.id, b.machine)])
            terms.append(lam * (1 - same))
    m.Minimize(sum(terms))

    if baseline:
        for o in free:
            b = baseline.get(o.id)
            if b is not None and o.id not in pre:
                m.AddHint(start[o.id], max(b.start, now))
                for mc in free_elig[o.id]:
                    if (o.id, mc) in lit:
                        m.AddHint(lit[(o.id, mc)], 1 if mc == b.machine else 0)

    invalid = m.Validate()
    if invalid:
        raise ValueError("model invalid: " + invalid)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.2, time_limit)
    solver.parameters.num_workers = workers
    solver.parameters.random_seed = seed
    status = solver.Solve(m)
    name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult([], name, wall_s=time.perf_counter() - t0, notes=["no feasible plan found"])

    placed = list(fixed.values())
    for o in free:
        s = solver.Value(start[o.id])
        mc = next(c for c in free_elig[o.id] if (o.id, c) in lit and solver.Value(lit[(o.id, c)]))
        placed.append(Placed(o.id, o.job, o.seq, mc, s, s + free_dur[o.id], state="planned"))
    _mark(placed, baseline)
    obj, bound = solver.ObjectiveValue(), solver.BestObjectiveBound()
    gap = max(0.0, (obj - bound) / max(1.0, abs(obj)))
    return SolveResult(placed, name, obj, bound, gap, time.perf_counter() - t0)


# --------------------------------------------------------------------------- heuristics
def _push(windows: list[Window], mc: str, t: int, d: int) -> int:
    """Earliest start >= t on machine mc that does not collide with a downtime window."""
    ws = sorted((w for w in windows if w.machine == mc), key=lambda w: w.start)
    moved = True
    while moved:
        moved = False
        for w in ws:
            if t < w.end and w.start < t + d:
                t, moved = w.end, True
    return t


def dispatch(jobs: list[JobIn], ops: list[OpIn], machines: list[str], *, now: int = 0,
             baseline: dict[str, Placed] | None = None, windows: list[Window] | None = None,
             rule: str = "fcfs", extend: dict[str, int] | None = None) -> SolveResult:
    """rule: fcfs | edd | right_shift. Starts from whatever is already done or running."""
    t0 = time.perf_counter()
    windows = list(windows or [])
    jobmap = {j.id: j for j in jobs}
    order = {j.id: i for i, j in enumerate(jobs)}
    by_job: dict[str, list[OpIn]] = defaultdict(list)
    for o in ops:
        by_job[o.job].append(o)
    for v in by_job.values():
        v.sort(key=lambda o: o.seq)
    fixed, free, pre = classify(ops, baseline, now, windows, freeze_min=0, extend=extend)
    placed: dict[str, Placed] = dict(fixed)
    mfree = defaultdict(lambda: now)
    for f in fixed.values():
        mfree[f.machine] = max(mfree[f.machine], f.end)
    dur = {o.id: pre.get(o.id, o.dur) for o in free}
    elig = {o.id: ([baseline[o.id].machine] if o.id in pre else list(dict.fromkeys(o.elig))) for o in free}

    def ready_at(o: OpIn) -> int | None:
        jo = by_job[o.job]
        i = jo.index(o)
        t = now
        if i == 0 or jo[i - 1].id in fixed:
            t = max(t, jobmap[o.job].release)
        if i > 0:
            p = placed.get(jo[i - 1].id)
            if p is None:
                return None
            t = max(t, p.end)
        return t

    def put(o: OpIn, mc: str, t: int) -> None:
        s = _push(windows, mc, max(t, mfree[mc]), dur[o.id])
        placed[o.id] = Placed(o.id, o.job, o.seq, mc, s, s + dur[o.id])
        mfree[mc] = s + dur[o.id]

    todo = list(free)
    if rule == "right_shift":
        # Keep each machine's original order. New work goes first (inserted at "now"); the rest slides.
        todo.sort(key=lambda o: ((baseline or {}).get(o.id).start if (baseline or {}).get(o.id) else -1, o.seq))
        for o in todo:
            t = ready_at(o)
            if t is None:  # predecessor not placed yet: place predecessors first (can happen for added jobs)
                continue
            b = (baseline or {}).get(o.id)
            if b is not None:
                put(o, elig[o.id][0] if o.id in pre else b.machine, t)
            else:
                mc = min(elig[o.id], key=lambda c: _push(windows, c, max(t, mfree[c]), dur[o.id]))
                put(o, mc, t)
        leftover = [o for o in todo if o.id not in placed]
        while leftover:
            progressed = False
            for o in list(leftover):
                t = ready_at(o)
                if t is not None:
                    mc = min(elig[o.id], key=lambda c: _push(windows, c, max(t, mfree[c]), dur[o.id]))
                    put(o, mc, t)
                    leftover.remove(o)
                    progressed = True
            if not progressed:
                break
    else:
        key = (lambda o: (order[o.job], o.seq)) if rule == "fcfs" else (
            lambda o: (jobmap[o.job].due if jobmap[o.job].due is not None else 10**9, o.seq))
        while todo:
            cand = [(key(o), o) for o in todo if ready_at(o) is not None]
            if not cand:
                break
            _, o = min(cand, key=lambda x: x[0])
            t = ready_at(o)
            mc = min(elig[o.id], key=lambda c: _push(windows, c, max(t, mfree[c]), dur[o.id]) + dur[o.id])
            put(o, mc, t)
            todo.remove(o)
    out = list(placed.values())
    _mark(out, baseline)
    return SolveResult(out, "HEURISTIC", wall_s=time.perf_counter() - t0)


# --------------------------------------------------------------------------- evaluation
def job_ends(jobs: list[JobIn], placed: list[Placed]) -> dict[str, int]:
    e: dict[str, int] = {}
    for p in placed:
        e[p.job] = max(e.get(p.job, 0), p.end)
    return e


def evaluate(jobs: list[JobIn], placed: list[Placed], baseline: dict[str, Placed] | None, now: int,
             families: dict[str, str] | None = None, origin_hour: float = 6.0, disruption_t: int | None = None) -> dict:
    """Shared metric definitions, used by the API and the benchmark."""
    ends = job_ends(jobs, placed)
    due_jobs = [j for j in jobs if j.due is not None and j.id in ends]
    on_time = sum(1 for j in due_jobs if ends[j.id] <= j.due)
    open_base = [p for p in (baseline or {}).values() if p.end > now and p.start >= now]
    moved = [p for p in placed if p.moved and p.old_start is not None]
    added = [p for p in placed if p.added]
    # changeover: machine switches product family between consecutive remaining operations
    fam = families or {}
    by_m: dict[str, list[Placed]] = defaultdict(list)
    for p in placed:
        if p.end > now:
            by_m[p.machine].append(p)
    chg = 0
    for seq in by_m.values():
        seq.sort(key=lambda p: p.start)
        for a, b in zip(seq, seq[1:]):
            if fam.get(a.job, "") != fam.get(b.job, "") and (fam.get(a.job) or fam.get(b.job)):
                chg += CHANGEOVER_MIN
    energy = 0.0
    for p in placed:
        if p.end <= now:
            continue
        hr = (origin_hour + p.start / 60.0) % 24
        rate = RATE_PEAK if TARIFF_PEAK[0] <= hr < TARIFF_PEAK[1] else RATE_NORMAL
        energy += (p.end - p.start) / 60.0 * KW_PER_MACHINE * rate
    touched = {p.machine for p in moved + added} | {p.old_machine for p in moved if p.old_machine}
    rec = None
    if disruption_t is not None:
        ends_ch = [p.end for p in moved + added]
        rec = max(0, (max(ends_ch) - disruption_t)) if ends_ch else 0
    return {
        "jobs_total": len(due_jobs), "on_time_jobs": on_time,
        "on_time_pct": round(100.0 * on_time / len(due_jobs), 1) if due_jobs else None,
        "open_ops": len(open_base), "moved_ops": len(moved), "added_ops": len(added),
        "moved_pct": round(100.0 * len(moved) / len(open_base), 1) if open_base else 0.0,
        "changeover_min": chg, "energy_cost": round(energy),
        "recovery_min": rec,
        "makespan": max((p.end for p in placed), default=0),
        "machines_touched": sorted(touched),
    }
