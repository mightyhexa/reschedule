"""Audit of the whole repair path. Random disruptions of every kind go through the real API, and every resulting plan is checked
against the rules a shop floor cannot break: no two jobs on a machine at once, steps in order, nothing inside a down window,
finished work untouched, durations honoured, and each event doing what it says."""
import os
import random
from pathlib import Path

import pytest

from conftest import signup

DEMO = Path(__file__).resolve().parent.parent.parent / "demo_data"


def shop(client, email, file="02_shop_week.xlsx"):
    signup(client, email=email, shop=email)
    r = client.post("/data/upload", files={"file": (file, (DEMO / file).read_bytes())})
    assert r.status_code == 200, r.text
    b = client.post("/plan/baseline", json={"time_limit": 2}).json()
    assert client.post(f"/schedules/{b['id']}/approve").status_code == 200
    return client.get("/schedules/current").json()["published"], client.get("/data/jobs").json()


def check_plan(s, base, data, ev, extra=0):
    ops, now = s["ops"], s["now_min"]
    spec = {(j["code"], o["seq"]): o for j in data["jobs"] for o in j["ops"]}
    by_m, by_job = {}, {}
    for o in ops:
        by_m.setdefault(o["machine"], []).append(o)
        by_job.setdefault(o["job"], []).append(o)
        assert o["end"] > o["start"] >= 0
    for m, line in by_m.items():
        line.sort(key=lambda o: o["start"])
        for a, b in zip(line, line[1:]):
            assert a["end"] <= b["start"], f"overlap on {m}: {a['op_id']} {b['op_id']}"
    for j, line in by_job.items():
        line.sort(key=lambda o: o["seq"])
        for a, b in zip(line, line[1:]):
            assert a["end"] <= b["start"], f"order broken in {j}"
    wins = [w for w in s["windows"] if w["kind"] in ("down", "absent")]
    for o in ops:
        if o["state"] in ("planned", "frozen"):
            assert o["start"] >= now, f"{o['op_id']} planned in the past"
            for w in wins:
                if w["machine"] == o["machine"]:
                    assert not (o["start"] < w["end"] and o["end"] > w["start"]), f"{o['op_id']} inside a {w['kind']} window"
    bmap = {o["op_id"]: o for o in base["ops"]}
    cancelled = ev["job_id"] if ev["type"] == "hold" and ev.get("cancel") else None
    for oid, b in bmap.items():
        if b["job"] == cancelled and b["end"] > now:
            continue
        n = next((o for o in ops if o["op_id"] == oid), None)
        if n is None:
            assert ev["type"] == "move_machine" and ev.get("avoid_machine"), f"{oid} vanished"
            continue
        if b["end"] <= now:
            assert (n["machine"], n["start"], n["end"]) == (b["machine"], b["start"], b["end"]), f"finished {oid} was touched"
        dur = spec[(n["job"], n["seq"])]["duration_min"] + (extra if ev["type"] == "overrun" and n["job"] == ev["job_id"] else 0)
        if ev["type"] != "overrun" or n["job"] != ev["job_id"]:
            started = b["start"] < now < b["end"]        # in progress when it happened: the remaining work may restart later
            ok = {dur, b["end"] - now} if started else {dur}
            assert n["end"] - n["start"] in ok, f"{oid} duration changed"
        allowed = spec[(n["job"], n["seq"])]["machines"]
        if ev["type"] == "move_machine" and not ev.get("avoid_machine") and n["job"] == ev["job_id"]:
            continue
        assert n["machine"] in allowed, f"{oid} on a machine it cannot use"


def live(base, now, job=None):
    return [o for o in base["ops"] if o["end"] > now and (job is None or o["job"] == job)]


def random_event(rng, base, data, now):
    machines, jobs = data["machines"], [j["code"] for j in data["jobs"]]
    L = live(base, now)
    j = rng.choice(L)["job"] if L else rng.choice(jobs)
    t = rng.choice(["breakdown", "absence", "power_cut", "material", "overrun", "deadline", "hold", "cancel", "rush", "gap",
                    "reorder", "swap", "move", "avoid", "multi"])
    m = rng.choice(machines)
    d = rng.choice([30, 60, 120, 240, 480])
    if t in ("breakdown", "absence"):
        return {"type": t, "machine": m, "duration_min": d, "start_in_min": rng.choice([0, 0, 60])}
    if t == "multi":
        return {"type": "breakdown", "machines": rng.sample(machines, 2), "machine": machines[0], "duration_min": d, "start_in_min": 0}
    if t == "power_cut":
        return {"type": t, "machines": rng.sample(machines, 2) if rng.random() < .5 else None, "duration_min": d}
    if t == "material":
        return {"type": t, "job_id": j, "delay_min": d}
    if t == "overrun":
        return {"type": t, "job_id": j, "extra_min": rng.choice([15, 45, 90])}
    if t == "deadline":
        due = next((x for x in data["jobs"] if x["code"] == j and x.get("due")), None)
        return {"type": t, "job_id": j, "shift_min": rng.choice([-120, 120, 480])} if due else {"type": "hold", "job_id": j, "duration_min": d, "cancel": False}
    if t == "hold":
        return {"type": "hold", "job_id": j, "duration_min": d, "cancel": False}
    if t == "cancel":
        return {"type": "hold", "job_id": j, "cancel": True, "duration_min": None}
    if t == "rush":
        return {"type": t, "job_id": f"R-{rng.randint(1, 99)}", "machine": rng.choice([m, None]), "duration_min": rng.choice([30, 90, 180]), "due_in_min": rng.choice([None, 240]), "priority": 1}
    if t == "gap":
        o = rng.choice(L)
        k = [x["job"] for x in L if x["machine"] == o["machine"] and x["job"] != o["job"]]
        return {"type": t, "job_id": o["job"], "second_job_id": rng.choice(k) if k and rng.random() < .7 else None, "machine": o["machine"], "duration_min": d, "reason": "fuzz"}
    if t == "reorder":
        return {"type": t, "job_id": j, "direction": rng.choice(["up", "down"]), "other_job_id": None, "machine": None}
    if t == "swap":
        k = rng.choice([x["job"] for x in L if x["job"] != j] or [j])
        return {"type": "reorder", "job_id": j, "other_job_id": k, "direction": rng.choice(["swap", "before", "after"]), "machine": None}
    spec = next(x for x in data["jobs"] if x["code"] == j)["ops"]
    if t == "move":
        return {"type": "move_machine", "job_id": j, "machine": rng.choice(spec[-1]["machines"])}
    return {"type": "move_machine", "job_id": j, "machine": None, "avoid_machine": rng.choice(machines)}


SEEDS = [("02_shop_week.xlsx", 1), ("02_shop_week.xlsx", 2), ("05_stress_test.xlsx", 3)]
if os.environ.get("FUZZ_MORE"):          # a longer soak: FUZZ_MORE=1 pytest tests/test_fuzz_repairs.py
    SEEDS += [("02_shop_week.xlsx", n) for n in range(10, 16)] + [("05_stress_test.xlsx", n) for n in range(20, 24)]


@pytest.mark.parametrize("file,seed", SEEDS)
def test_every_kind_of_repair_is_a_valid_plan(client, file, seed, monkeypatch):
    from app.routers import shop as shop_routes
    monkeypatch.setattr(shop_routes, "limit", lambda *a, **k: None)      # the 20-per-10-minutes guard is tested elsewhere
    base, data = shop(client, f"fuzz{seed}@x.com", file)
    rng = random.Random(seed)
    done = {"ok": 0, "refused": 0}
    for i in range(28):
        at = rng.choice([0, 30, 90])
        ev = random_event(rng, base, data, at)
        r = client.post("/events", json={"event": ev, "raw_text": "fuzz", "at_min": at, "freeze_min": rng.choice([0, 30, 60]), "time_limit": 1, "stability": rng.choice([0, .5, 1])})
        if r.status_code == 422:
            done["refused"] += 1                 # a clean refusal ("already first", "not on that machine") is fine
            assert isinstance(r.json()["detail"], str)
            continue
        assert r.status_code == 200, (ev, r.text)
        s = r.json()
        clean = {**ev}
        try:
            check_plan(s, base, data, clean, ev.get("extra_min", 0))
        except AssertionError as e:
            raise AssertionError(f"{e} | event={ev} at={at} status={s['metrics'].get('solver_status')} notes={s['params'].get('notes')}")
        t = ev["type"]
        mine = lambda job: [o for o in s["ops"] if o["job"] == job and o["state"] in ("planned", "frozen")]   # noqa: E731
        if t == "gap" and ev.get("second_job_id"):
            win = [w for w in s["windows"] if w["label"] == "fuzz" and w["kind"] == "down"]
            assert win, "gap window missing"
            assert all(o["start"] >= win[0]["end"] for o in mine(ev["second_job_id"])), "second job starts before the gap ends"
        if t == "hold" and ev.get("cancel"):
            assert not mine(ev["job_id"]), "cancelled job still planned"
        if t == "hold" and not ev.get("cancel"):
            assert all(o["start"] >= at + ev["duration_min"] for o in mine(ev["job_id"])), "held job started early"
        if t == "material":
            assert all(o["start"] >= at + ev["delay_min"] for o in mine(ev["job_id"])), "job started before its material"
        if t == "move_machine" and ev.get("machine"):
            assert all(o["machine"] == ev["machine"] for o in s["ops"] if o["job"] == ev["job_id"] and o["state"] in ("planned", "frozen") and o["seq"] == max(x["seq"] for x in mine(ev["job_id"]))), "job not moved"
        done["ok"] += 1
    assert done["ok"] >= 14, done
