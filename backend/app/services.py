"""Glue between the database and the engine: build a problem, run a baseline or a repair, store the result."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .config import get_settings
from .engine.model import JobIn, OpIn, Placed, Window
from .engine.scheduler import dispatch, evaluate, job_ends, solve
from .models import Event, Job, Machine, Operation, Schedule, Shop

S = get_settings()
ISO = "%Y-%m-%dT%H:%M:%S"


def local_now(shop: Shop) -> datetime:
    try:
        return datetime.now(ZoneInfo(shop.timezone)).replace(tzinfo=None, second=0, microsecond=0)
    except Exception:
        return datetime.now().replace(second=0, microsecond=0)


def mins(dt: datetime, origin: datetime) -> int:
    return int(round((dt - origin).total_seconds() / 60))


def op_id(code: str, seq: int) -> str:
    return f"{code}#{seq}"


def load_problem(db: Session, shop: Shop, origin: datetime):
    jobs_db = db.scalars(select(Job).where(Job.shop_id == shop.id).order_by(Job.code)).all()
    jobs, ops, fam = [], [], {}
    for j in jobs_db:
        jobs.append(JobIn(j.code, mins(j.due_at, origin) if j.due_at else None, j.priority, 0, j.family))
        fam[j.code] = j.family
        for o in j.ops:
            ops.append(OpIn(op_id(j.code, o.seq), j.code, o.seq, list(o.eligible), o.duration_min))
    machines = [m.code for m in db.scalars(select(Machine).where(Machine.shop_id == shop.id).order_by(Machine.code))]
    return jobs, ops, machines, fam


def current_schedule(db: Session, shop_id: str, status: str = "published") -> Schedule | None:
    return db.scalar(select(Schedule).where(Schedule.shop_id == shop_id, Schedule.status == status).order_by(Schedule.version.desc()))


def next_version(db: Session, shop_id: str) -> int:
    return (db.scalar(select(func.max(Schedule.version)).where(Schedule.shop_id == shop_id)) or 0) + 1


def to_baseline(s: Schedule) -> dict[str, Placed]:
    return {o["op_id"]: Placed(o["op_id"], o["job"], o["seq"], o["machine"], o["start"], o["end"]) for o in s.ops}


def _job_rows(jobs: list[JobIn], placed: list[Placed], prev: list[Placed] | None) -> list[dict]:
    ends = job_ends(jobs, placed)
    pe = job_ends(jobs, prev) if prev else {}
    out = []
    for j in jobs:
        if j.id not in ends:
            continue
        late = max(0, ends[j.id] - j.due) if j.due is not None else 0
        pl = max(0, pe[j.id] - j.due) if (j.due is not None and j.id in pe) else None
        out.append({"code": j.id, "due": j.due, "end": ends[j.id], "late_min": late, "prev_late_min": pl, "priority": j.priority})
    return out


def _moves(placed: list[Placed]) -> list[dict]:
    rows = []
    for p in placed:
        if p.moved and p.old_start is not None:
            rows.append({"op_id": p.op_id, "job": p.job, "seq": p.seq, "kind": "moved", "from_machine": p.old_machine,
                         "to_machine": p.machine, "from_start": p.old_start, "to_start": p.start, "delta_min": p.start - p.old_start})
        elif p.added:
            rows.append({"op_id": p.op_id, "job": p.job, "seq": p.seq, "kind": "added", "from_machine": None,
                         "to_machine": p.machine, "from_start": None, "to_start": p.start, "delta_min": 0})
    rows.sort(key=lambda r: (r["to_start"]))
    return rows


def _store(db: Session, shop: Shop, user, *, kind: str, parent: Schedule | None, event: Event | None, origin: datetime,
           now_min: int, jobs, ops, fam, res, base: dict | None, windows: list[Window], params: dict, material: list[dict],
           disruption_t: int | None, extend: dict[str, int] | None = None) -> Schedule:
    placed = res.placed
    prev_placed = list(base.values()) if base else None
    oh = origin.hour + origin.minute / 60
    metrics = evaluate(jobs, placed, base, now_min, fam, oh, disruption_t)
    metrics.update({"solver_status": res.status, "gap": None if res.gap is None else round(res.gap, 4),
                    "solve_s": round(res.wall_s, 2), "now_min": now_min})
    jr = _job_rows(jobs, placed, prev_placed)
    metrics["late_jobs"] = sum(1 for r in jr if r["late_min"] > 0)
    if base:  # context: what simply pushing everything later would have done
        rs = dispatch(jobs, ops, [m for m in {p.machine for p in placed}], now=now_min, baseline=base, windows=windows, rule="right_shift", extend=extend)
        ev = evaluate(jobs, rs.placed, base, now_min, fam, oh, disruption_t)
        metrics["right_shift"] = {"on_time_pct": ev["on_time_pct"], "moved_ops": ev["moved_ops"], "moved_pct": ev["moved_pct"]}
    tradeoffs = [{"job": r["code"], "extra_late_min": r["late_min"] - (r["prev_late_min"] or 0), "priority": r["priority"]}
                 for r in jr if r["prev_late_min"] is not None and r["late_min"] > r["prev_late_min"]]
    metrics["tradeoffs"] = sorted(tradeoffs, key=lambda t: -t["extra_late_min"])
    sch = Schedule(
        shop_id=shop.id, version=next_version(db, shop.id), kind=kind, status="draft", parent_id=parent.id if parent else None,
        event_id=event.id if event else None, origin=origin.strftime(ISO), now_min=now_min,
        ops=[p.as_dict() | {"duration": p.end - p.start} for p in sorted(placed, key=lambda p: (p.machine, p.start))],
        jobs=jr, windows=[w.as_dict() for w in windows] + material, metrics=metrics, moves=_moves(placed),
        params=params, created_by=user.id)
    db.add(sch)
    db.flush()
    return sch


def create_baseline(db: Session, shop: Shop, user, time_limit: float, plan_start: datetime | None) -> Schedule:
    origin = plan_start or local_now(shop)
    origin = origin.replace(second=0, microsecond=0)
    jobs, ops, machines, fam = load_problem(db, shop, origin)
    if not ops:
        raise HTTPException(409, "Upload job cards first.")
    # The plan's minute 0 is when the plan starts; due dates before it are simply already late.
    res = solve(jobs, ops, machines, time_limit=min(time_limit, S.solver_max_s), seed=1)
    if not res.placed:
        raise HTTPException(422, "No feasible plan: check that every operation has at least one valid machine.")
    return _store(db, shop, user, kind="baseline", parent=None, event=None, origin=origin, now_min=0, jobs=jobs, ops=ops, fam=fam,
                  res=res, base=None, windows=[], params={"time_limit": time_limit}, material=[], disruption_t=None)


def _extra_rush(ev: dict, machines: list[str], jobs: list[JobIn], now: int, taken: set[str]):
    code = str(ev.get("job_id") or "RUSH")[:40]
    base_code, n = code, 1
    while code in taken:
        n += 1
        code = f"{base_code}-{n}"
    elig = [ev["machine"]] if ev.get("machine") else list(machines)
    if ev.get("machine") and ev["machine"] not in machines:
        raise HTTPException(422, f"Unknown machine {ev['machine']}")
    dur = int(ev["duration_min"])
    due = now + int(ev["due_in_min"]) if ev.get("due_in_min") else now + dur + 240
    job = JobIn(code, due, int(ev.get("priority") or 1), now, "")
    return job, [OpIn(op_id(code, 1), code, 1, elig, dur)]


def validate_event(ev: dict, machines: list[str], job_codes: list[str]) -> dict:
    t = ev.get("type")
    try:
        if t in ("breakdown", "absence"):
            ms = list(dict.fromkeys(ev.get("machines") or [ev.get("machine")]))
            for m in ms:
                if m not in machines:
                    raise ValueError(f"Unknown machine {m!r}. Known: {', '.join(machines)}")
            d = int(ev["duration_min"])
            if not 1 <= d <= 10080:
                raise ValueError("Duration must be between 1 minute and 7 days")
            return {"type": t, "machine": ms[0], "machines": ms, "duration_min": d, "start_in_min": max(0, int(ev.get("start_in_min") or 0))}
        if t == "material":
            if ev.get("job_id") not in job_codes:
                raise ValueError(f"Unknown job {ev.get('job_id')!r}")
            d = int(ev["delay_min"])
            if not 1 <= d <= 10080:
                raise ValueError("Delay must be between 1 minute and 7 days")
            return {"type": t, "job_id": ev["job_id"], "delay_min": d}
        if t == "power_cut":
            d = int(ev["duration_min"])
            if not 1 <= d <= 10080:
                raise ValueError("Duration must be between 1 minute and 7 days")
            ms = ev.get("machines") or ([ev["machine"]] if ev.get("machine") else None)
            if ms:
                bad = [m for m in ms if m not in machines]
                if bad:
                    raise ValueError(f"Unknown machine {bad[0]!r}. Known: {', '.join(machines)}")
                ms = list(dict.fromkeys(ms))
            return {"type": t, "machines": ms or None, "duration_min": d, "start_in_min": max(0, int(ev.get("start_in_min") or 0))}
        if t == "overrun":
            if ev.get("job_id") not in job_codes:
                raise ValueError(f"Unknown job {ev.get('job_id')!r}")
            x = int(ev["extra_min"])
            if not 1 <= x <= 1440:
                raise ValueError("Extra time must be between 1 and 1440 minutes")
            seq = ev.get("op_seq")
            return {"type": t, "job_id": ev["job_id"], "extra_min": x, "op_seq": int(seq) if seq else None}
        if t == "deadline":
            if ev.get("job_id") not in job_codes:
                raise ValueError(f"Unknown job {ev.get('job_id')!r}")
            sh = int(ev["shift_min"])
            if sh == 0 or abs(sh) > 10080:
                raise ValueError("Move the due date by between 1 minute and 7 days, earlier (negative) or later")
            return {"type": t, "job_id": ev["job_id"], "shift_min": sh}
        if t == "hold":
            if ev.get("job_id") not in job_codes:
                raise ValueError(f"Unknown job {ev.get('job_id')!r}")
            cancel = bool(ev.get("cancel"))
            d = ev.get("duration_min")
            if not cancel:
                d = int(d)
                if not 1 <= d <= 10080:
                    raise ValueError("Hold time must be between 1 minute and 7 days")
            return {"type": t, "job_id": ev["job_id"], "duration_min": None if cancel else d, "cancel": cancel}
        if t == "gap":
            a, b = ev.get("job_id") or None, ev.get("second_job_id") or None
            if not a and not b:
                raise ValueError("Name the job the gap comes after")
            for j in (a, b):
                if j and j not in job_codes:
                    raise ValueError(f"Unknown job {j!r}")
            m = ev.get("machine") or None
            if m and m not in machines:
                raise ValueError(f"Unknown machine {m!r}. Known: {', '.join(machines)}")
            d = int(ev.get("duration_min") or 60)
            if not 1 <= d <= 10080:
                raise ValueError("The gap must be between 1 minute and 7 days")
            return {"type": t, "job_id": a or b, "second_job_id": b if a else None, "machine": m, "duration_min": d,
                    "reason": str(ev.get("reason") or "")[:120]}
        if t == "reorder":
            x, y = ev.get("job_id"), ev.get("other_job_id") or None
            d = ev.get("direction") or ("before" if y else "up")
            if d not in ("before", "after", "swap", "up", "down"):
                raise ValueError("Direction must be before, after, swap, up or down")
            if x not in job_codes or (y and y not in job_codes):
                raise ValueError(f"Unknown job {(x if x not in job_codes else y)!r}")
            if d in ("before", "after", "swap") and not y:
                raise ValueError("Name the second job")
            m = ev.get("machine") or None
            if m and m not in machines:
                raise ValueError(f"Unknown machine {m!r}")
            return {"type": t, "job_id": x, "other_job_id": y if d in ("before", "after", "swap") else None, "direction": d, "machine": m}
        if t == "move_machine":
            if ev.get("job_id") not in job_codes:
                raise ValueError(f"Unknown job {ev.get('job_id')!r}")
            av = ev.get("avoid_machine") or None
            if av and av not in machines:
                raise ValueError(f"Unknown machine {av!r}. Known: {', '.join(machines)}")
            if not av and ev.get("machine") not in machines:
                raise ValueError(f"Unknown machine {ev.get('machine')!r}. Known: {', '.join(machines)}")
            fm = ev.get("from_machine") or None
            return {"type": t, "job_id": ev["job_id"], "machine": None if av else ev["machine"], "avoid_machine": av,
                    "from_machine": fm if fm in machines else None, "op_seq": int(ev["op_seq"]) if ev.get("op_seq") else None}
        if t == "rush":
            d = int(ev["duration_min"])
            if not 1 <= d <= 1440:
                raise ValueError("Run time must be between 1 and 1440 minutes")
            m = ev.get("machine") or None
            if m and m not in machines:
                raise ValueError(f"Unknown machine {m!r}")
            due = ev.get("due_in_min")
            return {"type": t, "job_id": str(ev.get("job_id") or "RUSH")[:40], "machine": m, "duration_min": d,
                    "due_in_min": int(due) if due else None, "priority": min(9, max(1, int(ev.get("priority") or 1)))}
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(422, str(e) if isinstance(e, ValueError) else "Missing or invalid event fields")
    raise HTTPException(422, "Event type must be breakdown, absence, power_cut, material, overrun, deadline, hold, rush, gap, reorder or move_machine")


def describe_event(ev: dict) -> str:
    t = ev["type"]
    ms = ev.get("machines") or ([ev["machine"]] if ev.get("machine") else [])
    names = " and ".join(ms) if ms else "the whole shop"
    return {
        "breakdown": lambda: f"{names} {'are' if len(ms) > 1 else 'is'} down for {ev['duration_min']} min",
        "absence": lambda: f"{names} has no operator for {ev['duration_min']} min",
        "power_cut": lambda: f"Power cut on {names} for {ev['duration_min']} min",
        "material": lambda: f"Material for {ev['job_id']} arrives {ev['delay_min']} min late",
        "overrun": lambda: f"Job {ev['job_id']} runs {ev['extra_min']} min longer than planned",
        "deadline": lambda: f"Job {ev['job_id']} is due {abs(ev['shift_min'])} min {'earlier' if ev['shift_min'] < 0 else 'later'}",
        "hold": lambda: f"Job {ev['job_id']} is cancelled" if ev.get("cancel") else f"Job {ev['job_id']} is on hold for {ev['duration_min']} min",
        "gap": lambda: f"{ev['duration_min']} min gap " + (f"after {ev['job_id']}" if not ev.get("second_job_id") else f"between {ev['job_id']} and {ev['second_job_id']}") + (f" ({ev['reason']})" if ev.get("reason") else ""),
        "reorder": lambda: {"swap": f"Swap {ev['job_id']} and {ev.get('other_job_id')}", "before": f"Run {ev['job_id']} before {ev.get('other_job_id')}", "after": f"Run {ev['job_id']} after {ev.get('other_job_id')}", "up": f"Move {ev['job_id']} up", "down": f"Move {ev['job_id']} down"}[ev["direction"]],
        "move_machine": lambda: f"Take {ev['job_id']} off {ev['avoid_machine']} (runs elsewhere, or is removed if it can run nowhere else)" if ev.get("avoid_machine") else f"Move {ev['job_id']} to {ev['machine']}",
        "rush": lambda: f"Rush job {ev['job_id']} needs {ev['duration_min']} min" + (f" on {ev['machine']}" if ev.get("machine") else ""),
    }[t]()


def _job_op(ops, base, code, now, machine=None):
    """The job's operation that matters now: the one on `machine` if given, else its last unfinished one."""
    mine = sorted((o for o in ops if o.job == code), key=lambda o: o.seq)
    live = [o for o in mine if o.id not in base or base[o.id].end > now]
    if machine:
        hit = [o for o in live if o.id in base and base[o.id].machine == machine]
        if hit:
            return hit[-1]
    return (live or mine or [None])[-1]


def _order_pair(ops, base, now, p):
    """(first, second, first's placed op): `first` must run before `second`. 422 if it already does."""
    x, y, d = p["job_id"], p.get("other_job_id"), p["direction"]
    ox = _job_op(ops, base, x, now, p.get("machine"))
    if ox is None or ox.id not in base:
        raise HTTPException(422, f"Job {x} is not in the current plan.")
    if y is None:  # "move up / down": the neighbour on the same machine
        line = sorted((q for q in base.values() if q.machine == base[ox.id].machine and q.end > now), key=lambda q: q.start)
        i = next((i for i, q in enumerate(line) if q.op_id == ox.id), None)
        if i is None:
            raise HTTPException(422, f"Job {x} has already finished.")
        j = i - 1 if d == "up" else i + 1
        if not 0 <= j < len(line):
            raise HTTPException(422, f"{x} is already {'first' if d == 'up' else 'last'} on {base[ox.id].machine}.")
        y = line[j].job
    oy = _job_op(ops, base, y, now, p.get("machine"))
    if oy is None or oy.id not in base:
        raise HTTPException(422, f"Job {y} is not in the current plan.")
    if d in ("before", "up"):
        first, second, of, os_ = x, y, ox, oy
    elif d in ("after", "down"):
        first, second, of, os_ = y, x, oy, ox
    else:  # swap: flip whatever the order is now
        first, second, of, os_ = (x, y, ox, oy) if base[ox.id].start >= base[oy.id].start else (y, x, oy, ox)
    if base[of.id].start < base[os_.id].start:
        raise HTTPException(422, f"{first} already runs before {second}.")
    return first, second, base[of.id]


def create_repair(db: Session, shop: Shop, user, ev: Event, parent: Schedule, *, stability: float, freeze_min: int,
                  time_limit: float, at_min: int | None) -> Schedule:
    origin = datetime.strptime(parent.origin, ISO)
    now = at_min if at_min is not None else max(0, mins(local_now(shop), origin))
    jobs, ops, machines, fam = load_problem(db, shop, origin)
    base = to_baseline(parent)
    p = ev.payload
    windows = [Window(**w) for w in parent.windows if w.get("kind") in ("down", "absent") and w["end"] > now]
    material = [w for w in parent.windows if w.get("kind") == "material" and w["end"] > now]
    extra_jobs: list[dict] = []
    if p["type"] in ("breakdown", "absence"):
        s = now + p["start_in_min"]
        for mc in p.get("machines") or [p["machine"]]:
            windows.append(Window(mc, s, s + p["duration_min"], "down" if p["type"] == "breakdown" else "absent",
                                  f"{mc} {'down' if p['type'] == 'breakdown' else 'no operator'}"))
    elif p["type"] == "material":
        material.append({"kind": "material", "job": p["job_id"], "start": now, "end": now + p["delay_min"], "label": f"{p['job_id']} material late"})
    elif p["type"] == "rush":
        j, o = _extra_rush(p, machines, jobs, now, {x.id for x in jobs})
        jobs.append(j)
        ops += o
        fam[j.id] = ""
        extra_jobs.append({"code": j.id, "due": j.due, "priority": j.priority,
                           "ops": [{"seq": 1, "eligible": o[0].elig, "duration_min": o[0].dur}]})
    extend: dict[str, int] = {}
    job_changes: list[dict] = []
    notes_extra: list[str] = []
    jobmap = {j.id: j for j in jobs}
    if p["type"] == "power_cut":
        targets = p["machines"] or list(machines)
        s0 = now + p["start_in_min"]
        for mc in targets:
            windows.append(Window(mc, s0, s0 + p["duration_min"], "down", "Power cut"))
    elif p["type"] == "overrun":
        mine = sorted((o for o in ops if o.job == p["job_id"]), key=lambda o: o.seq)
        if p.get("op_seq"):
            target = next((o for o in mine if o.seq == p["op_seq"]), None)
        else:  # the operation in progress, else the next one that has not finished
            target = next((o for o in mine if o.id not in base or base[o.id].end > now), None)
        if target is None:
            raise HTTPException(422, f"Job {p['job_id']} has no unfinished operation to extend.")
        target.dur += p["extra_min"]
        extend[target.id] = p["extra_min"]
        job_changes.append({"code": target.job, "op_seq": target.seq, "duration_min": target.dur})
    elif p["type"] == "deadline":
        j = jobmap[p["job_id"]]
        if j.due is None:
            raise HTTPException(422, f"Job {p['job_id']} has no due date to move. Give it one in the job sheet first.")
        j.due += p["shift_min"]
        job_changes.append({"code": j.id, "due_min": j.due})
    elif p["type"] == "hold":
        if p["cancel"]:
            ops = [o for o in ops if not (o.job == p["job_id"] and (o.id not in base or base[o.id].end > now))]
            if not any(o.job == p["job_id"] for o in ops):
                jobs = [j for j in jobs if j.id != p["job_id"]]
            job_changes.append({"code": p["job_id"], "cancel": True})
        else:
            material.append({"kind": "material", "job": p["job_id"], "start": now, "end": now + p["duration_min"], "label": f"{p['job_id']} on hold"})
    elif p["type"] == "gap":
        why = p["reason"] or "Gap"
        end_gap = now + p["duration_min"]
        a = p["job_id"]
        ref = _job_op(ops, base, a, now, p["machine"])
        if ref is None or ref.id not in base:
            raise HTTPException(422, f"Job {a} is not in the current plan.")
        mc, s0 = base[ref.id].machine, max(now, base[ref.id].end)
        end_gap = s0 + p["duration_min"]
        windows.append(Window(mc, s0, end_gap, "down", why))
        if p.get("second_job_id"):
            material.append({"kind": "material", "job": p["second_job_id"], "start": now, "end": end_gap, "label": f"{p['second_job_id']} waits: {why}"})
        freeze_min = 0
    elif p["type"] == "reorder":
        first, second, fp = _order_pair(ops, base, now, p)
        material.append({"kind": "material", "job": second, "start": now, "end": fp.end, "label": f"{second} waits for {first}"})
        freeze_min = 0
    elif p["type"] == "move_machine":
        av = p.get("avoid_machine")
        o = _job_op(ops, base, p["job_id"], now, av or p.get("from_machine"))
        if p.get("op_seq"):
            o = next((q for q in ops if q.job == p["job_id"] and q.seq == p["op_seq"]), o)
        if o is None:
            raise HTTPException(422, f"Job {p['job_id']} has no unfinished operation to move.")
        if av:
            if o.id in base and base[o.id].machine != av and av not in o.elig:
                raise HTTPException(422, f"{p['job_id']} is not planned on {av}.")
            rest = [m for m in o.elig if m != av]
            if not rest:   # nowhere else to run: taking it off the machine means removing the step from the plan
                code = p["job_id"]
                ops = [q for q in ops if not (q.job == code and q.seq == o.seq and (q.id not in base or base[q.id].end > now))]
                if not any(q.job == code for q in ops):
                    jobs = [j for j in jobs if j.id != code]
                job_changes.append({"code": code, "op_seq": o.seq, "remove_op": True})
                notes_extra.append(f"{code} could only run on {av}, so its step was removed from the plan.")
            else:
                o.elig = rest
                job_changes.append({"code": o.job, "op_seq": o.seq, "machine_not": av})
        else:
            o.elig = [p["machine"]]
            job_changes.append({"code": o.job, "op_seq": o.seq, "machine": p["machine"]})
        freeze_min = 0
    for m in material:
        for j in jobs:
            if j.id == m["job"]:
                j.release = max(j.release, m["end"])
    lam = max(0.0, min(1.0, stability))
    penalty = lam * 60.0  # minutes of weighted lateness one moved operation is worth
    thaw = {m["job"] for m in material if m["end"] > now}     # a job told to wait cannot keep a step "frozen" at its old time
    res = solve(jobs, ops, machines, now=now, baseline=base, windows=windows, freeze_min=freeze_min,
                move_penalty=penalty, time_limit=min(time_limit, S.solver_max_s), seed=1, extend=extend, thaw=thaw)
    notes = list(notes_extra)
    if not res.placed:  # safety net: never leave the manager with nothing
        res = dispatch(jobs, ops, machines, now=now, baseline=base, windows=windows, rule="right_shift", extend=extend)
        res.status = "FALLBACK_RIGHT_SHIFT"
        notes.append("The solver found no plan in time; showing a right-shift plan instead.")
    params = {"stability": lam, "freeze_min": freeze_min, "time_limit": time_limit, "extra_jobs": extra_jobs, "notes": notes,
              "job_changes": job_changes}
    return _store(db, shop, user, kind="repair", parent=parent, event=ev, origin=origin, now_min=now, jobs=jobs, ops=ops, fam=fam,
                  res=res, base=base, windows=windows, params=params, material=material, disruption_t=now, extend=extend)


def persist_job_changes(db: Session, shop: Shop, sch: Schedule) -> None:
    """On approval, overruns, moved due dates and cancelled jobs become the new truth for later repairs."""
    origin = datetime.strptime(sch.origin, ISO)
    for c in sch.params.get("job_changes", []):
        job = db.scalar(select(Job).where(Job.shop_id == shop.id, Job.code == c["code"]))
        if not job:
            continue
        if c.get("cancel"):
            db.delete(job)
        elif "duration_min" in c:
            for o in job.ops:
                if o.seq == c["op_seq"]:
                    o.duration_min = c["duration_min"]
        elif c.get("remove_op"):
            for o in list(job.ops):
                if o.seq == c["op_seq"]:
                    db.delete(o)
            if len(job.ops) <= 1:
                db.delete(job)
        elif "machine_not" in c:
            for o in job.ops:
                if o.seq == c["op_seq"] and [m for m in o.eligible if m != c["machine_not"]]:
                    o.eligible = [m for m in o.eligible if m != c["machine_not"]]
        elif "machine" in c:
            for o in job.ops:
                if o.seq == c["op_seq"]:
                    o.eligible = [c["machine"]]
        elif "due_min" in c:
            job.due_at = origin + timedelta(minutes=c["due_min"])


def persist_extra_jobs(db: Session, shop: Shop, sch: Schedule) -> None:
    """On approval, rush jobs from the event become real jobs so later repairs know about them."""
    origin = datetime.strptime(sch.origin, ISO)
    for e in sch.params.get("extra_jobs", []):
        if db.scalar(select(Job).where(Job.shop_id == shop.id, Job.code == e["code"])):
            continue
        j = Job(shop_id=shop.id, code=e["code"], due_at=origin + timedelta(minutes=e["due"]) if e["due"] is not None else None,
                priority=e["priority"], family="")
        db.add(j)
        for o in e["ops"]:
            j.ops.append(Operation(seq=o["seq"], eligible=o["eligible"], duration_min=o["duration_min"]))
