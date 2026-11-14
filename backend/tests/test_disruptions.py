"""Every kind of disruption, typed or built by hand, must plan; the importer must take odd files; Gemini may only propose."""
import io
import json
from pathlib import Path

import pytest

from conftest import signup
from app import llm_gemini

DEMO = Path(__file__).resolve().parent.parent.parent / "demo_data"


def shop_with_plan(client, email):
    signup(client, email=email, shop=email)
    r = client.post("/data/upload", files={"file": ("a.xlsx", (DEMO / "02_shop_week.xlsx").read_bytes())})
    assert r.status_code == 200, r.text
    b = client.post("/plan/baseline", json={"time_limit": 2}).json()
    assert client.post(f"/schedules/{b['id']}/approve").status_code == 200
    return client.get("/data/jobs").json()


@pytest.mark.parametrize("text,kind", [
    ("Lathe-2 broke down for 3 hours", "breakdown"),
    ("VMC-1 and VMC-2 down for 2 hours", "breakdown"),
    ("Power cut for 90 minutes", "power_cut"),
    ("Power cut on VMC-1 and VMC-3 for 1 hour", "power_cut"),
    ("Operator absent on VMC-2 for 2 hours", "absence"),
    ("Rush job R-1 needs 45 minutes on GRIND-1", "rush"),
])
def test_typed_disruptions_plan(client, text, kind):
    data = shop_with_plan(client, f"{kind}{abs(hash(text)) % 9999}@x.com")
    p = client.post("/events/parse", json={"text": text}).json()
    assert p["event"]["type"] == kind and p["confident"], p
    r = client.post("/events", json={"event": p["event"], "raw_text": text, "stability": 0.5, "freeze_min": 30, "at_min": 30})
    assert r.status_code == 200, r.text
    wins = [w for w in r.json()["windows"] if w["kind"] in ("down", "absent")]
    if kind == "power_cut" and "on" not in text:
        assert {w["machine"] for w in wins} == set(data["machines"])      # whole shop
    if text.startswith("VMC-1 and"):
        assert {w["machine"] for w in wins} == {"VMC-1", "VMC-2"}


def test_job_events_overrun_deadline_hold_cancel_and_approval_persists(client):
    data = shop_with_plan(client, "jobs@x.com")
    job = next(j for j in data["jobs"] if j["due"])
    code = job["code"]
    # overrun
    p = client.post("/events/parse", json={"text": f"Job {code} is taking 45 minutes longer"}).json()
    assert p["event"] == {"type": "overrun", "job_id": code, "extra_min": 45}, p
    r = client.post("/events", json={"event": p["event"], "at_min": 20})
    assert r.status_code == 200, r.text
    assert client.post(f"/schedules/{r.json()['id']}/approve").status_code == 200
    total = sum(o["duration_min"] for o in next(j for j in client.get("/data/jobs").json()["jobs"] if j["code"] == code)["ops"])
    assert total == sum(o["duration_min"] for o in job["ops"]) + 45          # approval made the longer time the new truth
    # deadline earlier
    p = client.post("/events/parse", json={"text": f"Customer needs {code} two hours earlier"}).json()
    assert p["event"]["shift_min"] == -120, p
    r = client.post("/events", json={"event": p["event"], "at_min": 20})
    assert r.status_code == 200, r.text
    client.post(f"/schedules/{r.json()['id']}/approve")
    new_due = next(j for j in client.get("/data/jobs").json()["jobs"] if j["code"] == code)["due"]
    assert new_due < job["due"]
    # hold, then cancel
    p = client.post("/events/parse", json={"text": f"Hold job {code} for 3 hours"}).json()
    assert p["event"]["type"] == "hold" and p["event"]["duration_min"] == 180
    r = client.post("/events", json={"event": p["event"], "at_min": 20})
    assert r.status_code == 200, r.text
    client.post(f"/schedules/{r.json()['id']}/approve")
    p = client.post("/events/parse", json={"text": f"Cancel job {code}"}).json()
    r = client.post("/events", json={"event": p["event"], "at_min": 20})
    assert r.status_code == 200, r.text
    client.post(f"/schedules/{r.json()['id']}/approve")
    assert code not in [j["code"] for j in client.get("/data/jobs").json()["jobs"]]


def test_bad_events_are_refused_politely(client):
    shop_with_plan(client, "bad@x.com")
    for ev in [{"type": "power_cut", "duration_min": 0}, {"type": "overrun", "job_id": "NOPE", "extra_min": 5},
               {"type": "deadline", "job_id": "NOPE", "shift_min": 5}, {"type": "breakdown", "machines": ["ZZ"], "duration_min": 5},
               {"type": "explode"}]:
        assert client.post("/events", json={"event": ev}).status_code == 422


def test_gemini_only_proposes(client, monkeypatch):
    data = shop_with_plan(client, "llm@x.com")
    code = data["jobs"][0]["code"]
    monkeypatch.setattr(llm_gemini, "enabled", lambda: True)
    monkeypatch.setattr(llm_gemini, "complete_json", lambda s, u, **k: {"type": "deadline", "job_id": code, "shift_min": 180})
    p = client.post("/events/parse", json={"text": f"the customer is relaxed now about {code}, give them a bit more time"}).json()
    assert p["source"] == "gemini" and p["event"] == {"type": "deadline", "job_id": code, "shift_min": 180}
    # an invented machine from the model is thrown away; we fall back to what the rules understood
    monkeypatch.setattr(llm_gemini, "complete_json", lambda s, u, **k: {"type": "breakdown", "machine": "TOTALLY-FAKE", "duration_min": 5})
    p = client.post("/events/parse", json={"text": "something odd happened"}).json()
    assert p["source"] == "rules" and not p["confident"]

    def boom(*a, **k):
        raise llm_gemini.LLMError("busy")
    monkeypatch.setattr(llm_gemini, "complete_json", boom)
    assert client.post("/events/parse", json={"text": "something odd happened"}).json()["confident"] is False


def csv_file(text, name="odd.csv"):
    return {"file": (name, text.encode())}


def test_hours_and_casual_dates_import(client):
    signup(client, email="hrs@x.com", shop="hrs shop")
    body = "Part No,Station,Est Time (hrs),Ship Date\nP-1,CNC1|CNC2,1.5,tomorrow 5pm\nP-1,CNC3,0.75,14 Nov\nP-2,CNC1,2,+8h\n"
    r = client.post("/data/upload?dry_run=true", files=csv_file(body))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["duration_unit"] == "hours" and d["summary"] == {"jobs": 2, "operations": 3, "machines": 3}
    assert [o["duration_min"] for o in d["preview"][0]["ops"]] == [90, 45]


def test_unknown_columns_ask_for_a_mapping_then_import(client):
    signup(client, email="map@x.com", shop="map shop")
    body = "Thingy,Where,How long,By when\nA1,Press-1,30,tomorrow 5pm\nA2,Press-2,45,tomorrow 6pm\n"
    r = client.post("/data/upload?dry_run=true", files=csv_file(body))
    assert r.status_code == 422 and r.json()["detail"]["needs_mapping"] is True
    d = r.json()["detail"]
    assert "Thingy" in d["columns"] and d["sample"] and "eligible_machines" in d["missing"]
    m = {"job_id": "Thingy", "eligible_machines": "Where", "duration_min": "How long", "due_at": "By when", "duration_unit": "minutes"}
    r = client.post("/data/upload", files=csv_file(body), data={"mapping": json.dumps(m)})
    assert r.status_code == 200 and r.json()["saved"] and r.json()["summary"]["jobs"] == 2
    assert client.post("/data/upload", files=csv_file(body), data={"mapping": "{not json"}).status_code == 422


def test_no_machine_column_can_use_typed_machines(client):
    signup(client, email="nom@x.com", shop="nom shop")
    body = "Job,Minutes\nX1,30\nX2,45\n"
    r = client.post("/data/upload?dry_run=true", files=csv_file(body))
    assert r.status_code == 422 and r.json()["detail"]["needs_mapping"]
    r = client.post("/data/upload", files=csv_file(body), data={"mapping": json.dumps({"default_machines": "M1|M2"})})
    assert r.status_code == 200 and r.json()["machines"] == ["M1", "M2"]


def test_manual_table_entry(client):
    signup(client, email="man@x.com", shop="man")
    rows = [{"job_id": "T-1", "eligible_machines": "M1|M2", "duration_min": 60, "due_at": "tomorrow 5pm", "priority": 1},
            {"job_id": "T-1", "eligible_machines": "M3", "duration_min": 30},
            {"job_id": "T-2", "eligible_machines": "M1", "duration_min": 45, "due_at": "+10h"},
            {"job_id": "", "eligible_machines": "", "duration_min": None}]          # blank line is ignored
    r = client.post("/data/manual", json={"rows": rows})
    assert r.status_code == 200, r.text
    assert r.json()["summary"] == {"jobs": 2, "operations": 3, "machines": 3} and r.json()["saved"]
    bad = client.post("/data/manual", json={"rows": [{"job_id": "Z", "eligible_machines": "", "duration_min": 10}]})
    assert bad.status_code == 422 and bad.json()["detail"]["error_count"] == 1
    assert client.post("/plan/baseline", json={"time_limit": 2}).status_code == 200


# ------------------------------------------------------------------ gap / reorder / move_machine
def _published(client):
    return client.get("/schedules/current").json()["published"]


def _one_op_jobs_on_a_busy_machine(pub, after=60):
    """A machine with at least three jobs that each have ONE operation on it, still ahead, in plan order."""
    for mc in sorted({o["machine"] for o in pub["ops"]}):
        ahead = sorted((o for o in pub["ops"] if o["machine"] == mc and o["start"] > after and o["state"] == "planned"), key=lambda o: o["start"])
        once = [o for o in ahead if sum(1 for q in ahead if q["job"] == o["job"]) == 1]
        if len(once) >= 3:
            return mc, once
    raise AssertionError("demo plan has no machine with three single-operation jobs ahead")


def _event(client, ev, **kw):
    body = {"event": ev, "raw_text": "test", "stability": 0.5, "freeze_min": 0, "at_min": 20, "time_limit": 2}
    body.update(kw)
    return client.post("/events", json=body)


def test_typed_gap_reorder_and_move_are_understood(client):
    data = shop_with_plan(client, "newparse@x.com")
    a, b = data["jobs"][0]["code"], data["jobs"][1]["code"]
    m = data["machines"][0]
    p = client.post("/events/parse", json={"text": f"Add a gap between {a} and {b} because operator late for work"}).json()
    assert p["event"]["type"] == "gap" and p["event"]["duration_min"] == 60 and p["event"]["reason"] == "operator late for work" and p["confident"], p
    p = client.post("/events/parse", json={"text": f"leave a 2 hour gap after {a}"}).json()
    assert p["event"]["type"] == "gap" and p["event"]["duration_min"] == 120 and p["event"]["second_job_id"] is None, p
    p = client.post("/events/parse", json={"text": f"swap {a} and {b}"}).json()
    assert p["event"]["type"] == "reorder" and p["event"]["direction"] == "swap" and p["confident"], p
    p = client.post("/events/parse", json={"text": f"run {b} before {a}"}).json()
    assert (p["event"]["job_id"], p["event"]["other_job_id"], p["event"]["direction"]) == (b, a, "before"), p
    p = client.post("/events/parse", json={"text": f"move {a} up"}).json()
    assert p["event"]["type"] == "reorder" and p["event"]["direction"] == "up", p
    p = client.post("/events/parse", json={"text": f"move {a} to {m}"}).json()
    assert p["event"]["type"] == "move_machine" and p["event"]["machine"] == m, p


def test_gap_blocks_the_machine_and_makes_the_next_job_wait(client):
    shop_with_plan(client, "gap@x.com")
    mc, once = _one_op_jobs_on_a_busy_machine(_published(client))
    a, b = once[0], once[1]
    r = _event(client, {"type": "gap", "job_id": a["job"], "second_job_id": b["job"], "machine": mc, "duration_min": 90, "reason": "operator late"})
    assert r.status_code == 200, r.text
    s = r.json()
    gap = [w for w in s["windows"] if w["kind"] == "down" and w["machine"] == mc and w["label"] == "operator late"]
    assert len(gap) == 1 and gap[0]["end"] - gap[0]["start"] == 90 and gap[0]["start"] >= a["end"], gap
    for o in s["ops"]:                                                  # nothing is planned inside the gap
        if o["machine"] == mc and o["state"] == "planned":
            assert o["end"] <= gap[0]["start"] or o["start"] >= gap[0]["end"], o
    assert any(w["kind"] == "material" and w["job"] == b["job"] for w in s["windows"])
    assert client.post(f"/schedules/{s['id']}/approve").status_code == 200


def test_reorder_runs_one_job_after_another_and_refuses_the_pointless(client):
    shop_with_plan(client, "reorder@x.com")
    mc, once = _one_op_jobs_on_a_busy_machine(_published(client))
    early, late = once[0], once[2]
    r = _event(client, {"type": "reorder", "job_id": late["job"], "other_job_id": early["job"], "direction": "before", "machine": mc})
    assert r.status_code == 200, r.text
    s = r.json()
    moved = next(o for o in s["ops"] if o["op_id"] == early["op_id"])
    assert moved["start"] >= late["end"], (moved, late)                 # the one that now waits starts after the other's old finish
    assert s["metrics"]["moved_ops"] >= 1
    # asking for the order the plan already has is refused with a clear message, not a silent no-op
    again = _event(client, {"type": "reorder", "job_id": early["job"], "other_job_id": late["job"], "direction": "before", "machine": mc})
    assert again.status_code == 422 and "already runs before" in again.text
    # "up" on the first waiting job of a machine has nobody to jump over
    first = _event(client, {"type": "reorder", "job_id": early["job"], "direction": "up", "machine": mc}, at_min=early["start"] - 1)
    assert first.status_code in (200, 422)


def test_move_machine_puts_the_job_there_and_it_sticks_after_approval(client):
    data = shop_with_plan(client, "move@x.com")
    pub = _published(client)
    elig = {(j["code"], o["seq"]): o["machines"] for j in data["jobs"] for o in j["ops"]}
    op = next(o for o in sorted(pub["ops"], key=lambda o: o["start"])
              if o["state"] == "planned" and o["start"] > 60 and any(m != o["machine"] for m in elig[(o["job"], o["seq"])]))
    alt = next(m for m in elig[(op["job"], op["seq"])] if m != op["machine"])
    r = _event(client, {"type": "move_machine", "job_id": op["job"], "machine": alt, "from_machine": op["machine"], "op_seq": op["seq"]})
    assert r.status_code == 200, r.text
    s = r.json()
    assert next(o for o in s["ops"] if o["op_id"] == op["op_id"])["machine"] == alt
    assert client.post(f"/schedules/{s['id']}/approve").status_code == 200
    now_elig = next(j for j in client.get("/data/jobs").json()["jobs"] if j["code"] == op["job"])["ops"]
    assert next(o for o in now_elig if o["seq"] == op["seq"])["machines"] == [alt]


def test_bad_gap_reorder_move_events_are_refused_politely(client):
    data = shop_with_plan(client, "badnew@x.com")
    a, b, m = data["jobs"][0]["code"], data["jobs"][1]["code"], data["machines"][0]
    for ev in [{"type": "gap"}, {"type": "gap", "job_id": "NOPE"}, {"type": "gap", "job_id": a, "machine": "ZZ"},
               {"type": "gap", "job_id": a, "duration_min": 999999},
               {"type": "reorder", "job_id": a, "direction": "swap"}, {"type": "reorder", "job_id": a, "direction": "sideways"},
               {"type": "reorder", "job_id": "NOPE", "direction": "up"},
               {"type": "move_machine", "job_id": a, "machine": "ZZ"}, {"type": "move_machine", "job_id": "NOPE", "machine": m}]:
        assert client.post("/events", json={"event": ev}).status_code == 422, ev
    assert client.post("/events", json={"event": {"type": "reorder", "job_id": a, "other_job_id": b, "direction": "before"}, "at_min": 20}).status_code in (200, 422)
