"""Gaps, swaps, move up/down and machine moves: typed, built by hand, and checked against the resulting plan."""
from conftest import signup
from test_disruptions import shop_with_plan


def plan_ops(s):
    by = {}
    for o in s["ops"]:
        by.setdefault(o["job"], []).append(o)
    return by


def two_on_one_machine(client):
    cur = client.get("/schedules/current").json()["published"]
    line = {}
    for o in cur["ops"]:
        line.setdefault(o["machine"], []).append(o)
    for m, ops in line.items():
        ops.sort(key=lambda o: o["start"])
        if len(ops) >= 3:
            return m, ops
    raise AssertionError("no machine with 3 ops")


def test_gap_between_two_jobs_text_and_plan(client):
    shop_with_plan(client, "gap@x.com")
    m, ops = two_on_one_machine(client)
    a, b = ops[0]["job"], ops[1]["job"]
    text = f"put a 3 hour gap between {a} and {b} on {m}, operator late for work"
    p = client.post("/events/parse", json={"text": text}).json()
    ev = p["event"]
    assert ev["type"] == "gap" and ev["job_id"] == a and ev["second_job_id"] == b and ev["duration_min"] == 180, p
    assert "operator late" in ev["reason"]
    r = client.post("/events", json={"event": ev, "raw_text": text, "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text
    by = plan_ops(r.json())
    end_a = max(o["end"] for o in by[a] if o["machine"] == m) if any(o["machine"] == m for o in by[a]) else max(o["end"] for o in by[a])
    start_b = min(o["start"] for o in by[b])
    assert start_b >= ops[0]["end"] + 180 - 1, (start_b, ops[0]["end"])
    assert any(w["kind"] == "down" and w["label"].startswith("operator late") for w in r.json()["windows"])


def test_gap_typo_and_default_length(client):
    shop_with_plan(client, "gap2@x.com")
    m, ops = two_on_one_machine(client)
    a, b = ops[0]["job"], ops[1]["job"]
    p = client.post("/events/parse", json={"text": f"{m} add ga p between {a} and {b}"}).json()
    assert p["event"]["type"] == "gap" and p["event"]["duration_min"] == 60 and p["confident"], p


def test_reorder_swap_before_up_down(client):
    shop_with_plan(client, "re@x.com")
    m, ops = two_on_one_machine(client)
    a, b = ops[0]["job"], ops[1]["job"]
    p = client.post("/events/parse", json={"text": f"swap {a} and {b}"}).json()
    assert p["event"]["type"] == "reorder" and p["event"]["direction"] == "swap", p
    r = client.post("/events", json={"event": p["event"], "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text
    by = plan_ops(r.json())
    assert min(o["start"] for o in by[b]) <= min(o["start"] for o in by[a])
    # "move down" by hand, through the structured event
    r = client.post("/events", json={"event": {"type": "reorder", "job_id": a, "direction": "down"}, "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text
    # moving something already first up is a clear 422, not a crash
    r = client.post("/events", json={"event": {"type": "reorder", "job_id": b, "other_job_id": a, "direction": "before"}, "freeze_min": 0, "at_min": 0})
    assert r.status_code in (200, 422)


def test_move_machine_and_persist_on_approval(client):
    data = shop_with_plan(client, "mv@x.com")
    cur = client.get("/schedules/current").json()["published"]
    o = next(o for o in cur["ops"] if len(next(j for j in data["jobs"] if j["code"] == o["job"])["ops"][o["seq"] - 1]["machines"]) > 1)
    job = next(j for j in data["jobs"] if j["code"] == o["job"])
    target = next(m for m in job["ops"][o["seq"] - 1]["machines"] if m != o["machine"])
    p = client.post("/events/parse", json={"text": f"move {o['job']} from {o['machine']} to {target}"}).json()
    assert p["event"]["type"] == "move_machine" and p["event"]["machine"] == target, p
    r = client.post("/events", json={"event": p["event"], "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text
    assert all(x["machine"] == target for x in r.json()["ops"] if x["job"] == o["job"] and x["seq"] == o["seq"])
    assert client.post(f"/schedules/{r.json()['id']}/approve").status_code == 200
    j2 = next(j for j in client.get("/data/jobs").json()["jobs"] if j["code"] == o["job"])
    assert j2["ops"][o["seq"] - 1]["machines"] == [target]


def test_bad_inputs_are_clean_errors(client):
    shop_with_plan(client, "adjbad@x.com")
    for ev in ({"type": "gap", "job_id": "NOPE", "duration_min": 30},
               {"type": "reorder", "job_id": "J-1", "direction": "sideways"},
               {"type": "move_machine", "job_id": "J-1", "machine": "NOPE"}):
        assert client.post("/events", json={"event": ev}).status_code == 422


def test_remove_job_from_machine_and_plain_remove_is_cancel(client):
    data = shop_with_plan(client, "rm@x.com")
    cur = client.get("/schedules/current").json()["published"]
    o = next(o for o in cur["ops"] if len(next(j for j in data["jobs"] if j["code"] == o["job"])["ops"][o["seq"] - 1]["machines"]) > 1)
    p = client.post("/events/parse", json={"text": f"remove {o['job'].lower()} in {o['machine'].lower()}"}).json()
    assert p["event"]["type"] == "move_machine" and p["event"]["avoid_machine"] == o["machine"] and p["confident"], p
    r = client.post("/events", json={"event": p["event"], "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text
    assert all(x["machine"] != o["machine"] for x in r.json()["ops"] if x["job"] == o["job"] and x["seq"] == o["seq"])
    assert client.post(f"/schedules/{r.json()['id']}/approve").status_code == 200
    again = next(j for j in client.get("/data/jobs").json()["jobs"] if j["code"] == o["job"])
    assert o["machine"] not in again["ops"][o["seq"] - 1]["machines"]
    p = client.post("/events/parse", json={"text": f"remove {o['job']}"}).json()
    assert p["event"]["type"] == "hold" and p["event"]["cancel"] is True, p


def test_cannot_take_job_off_its_only_machine_and_unknown_text_gets_options(client):
    data = shop_with_plan(client, "only@x.com")
    cur = client.get("/schedules/current").json()["published"]
    o = next(o for o in cur["ops"] if len(next(j for j in data["jobs"] if j["code"] == o["job"])["ops"][o["seq"] - 1]["machines"]) == 1)
    r = client.post("/events", json={"event": {"type": "move_machine", "job_id": o["job"], "avoid_machine": o["machine"]}, "freeze_min": 0, "at_min": 0})
    assert r.status_code == 200, r.text                      # nowhere else to go: the step is removed, and the plan says so
    assert not [x for x in r.json()["ops"] if x["job"] == o["job"] and x["seq"] == o["seq"]]
    assert any("only run on" in n for n in r.json()["params"]["notes"])
    assert client.post(f"/schedules/{r.json()['id']}/approve").status_code == 200
    p = client.post("/events/parse", json={"text": f"something odd happened with {o['job']} near {o['machine']}"}).json()
    assert p["event"].get("type") is None and len(p["options"]) >= 2, p
    for opt in p["options"]:
        assert client.post("/events", json={"event": opt["event"], "freeze_min": 0, "at_min": 0}).status_code in (200, 422)
