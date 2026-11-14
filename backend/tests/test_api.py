import io
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app
from conftest import signup

H = {"X-Requested-With": "reschedule"}


def csv_bytes(due_days=2):
    d = (datetime.now() + timedelta(days=due_days)).strftime("%Y-%m-%dT%H:%M")
    rows = ["job_id,op_seq,eligible_machines,duration_min,due_at,priority,family"]
    for i in range(1, 7):
        rows += [f"J-{i},1,M{(i % 3) + 1}|M1,60,{d},{1 + i % 3},steel", f"J-{i},2,M2|M3,45,{d},{1 + i % 3},steel"]
    return "\n".join(rows).encode()


def upload(c, data=None, name="jobs.csv"):
    return c.post("/data/upload", files={"file": (name, io.BytesIO(data or csv_bytes()), "text/csv")})


def test_csrf_header_required():
    c = TestClient(app)  # no header
    assert c.post("/auth/login", json={"email": "a@b.co", "password": "x"}).status_code == 403


def test_register_verify_login_logout():
    c = TestClient(app, headers=H)
    u = signup(c, "a1@example.com")
    assert u["role"] == "owner" and c.get("/auth/me").status_code == 200
    c.post("/auth/logout")
    assert c.get("/auth/me").status_code == 401
    r = c.post("/auth/login", json={"email": "a1@example.com", "password": "correct-horse-9"})
    assert r.status_code == 200
    assert c.post("/auth/refresh").status_code == 200


def test_wrong_password_and_lockout():
    c = TestClient(app, headers=H)
    signup(c, "lock@example.com")
    c.post("/auth/logout")
    from app import ratelimit
    for _ in range(5):
        ratelimit.reset()
        assert c.post("/auth/login", json={"email": "lock@example.com", "password": "nope-nope-nope"}).status_code == 401
    ratelimit.reset()
    assert c.post("/auth/login", json={"email": "lock@example.com", "password": "correct-horse-9"}).status_code == 429


def test_weak_password_rejected():
    c = TestClient(app, headers=H)
    r = c.post("/auth/register", json={"name": "X Y", "email": "w@example.com", "password": "short", "shop_name": "S"})
    assert r.status_code == 422


def test_refresh_token_reuse_kills_family():
    c = TestClient(app, headers=H)
    signup(c, "reuse@example.com")
    old = c.cookies.get("rs_refresh")
    assert c.post("/auth/refresh").status_code == 200
    c2 = TestClient(app, headers=H)
    c2.cookies.set("rs_refresh", old, path="/auth")
    assert c2.post("/auth/refresh").status_code == 401  # stolen/old token
    assert c.post("/auth/refresh").status_code == 401  # whole chain revoked


def test_whatsapp_otp_login_for_invited_manager_and_rbac():
    owner = TestClient(app, headers=H)
    signup(owner, "own2@example.com", "Shop B")
    r = owner.post("/team", json={"name": "Meena Manager", "phone": "98765 43210", "role": "manager"})
    assert r.status_code == 200 and r.json()["phone"] == "+919876543210"
    owner.post("/team", json={"name": "Omar Operator", "email": "op@example.com", "role": "operator"})

    mgr = TestClient(app, headers=H)
    r = mgr.post("/auth/otp/request", json={"target": "9876543210"})
    code = r.json()["dev_code"]
    assert mgr.post("/auth/otp/verify", json={"target": "9876543210", "code": "000000"}).status_code == 400
    r = mgr.post("/auth/otp/verify", json={"target": "9876543210", "code": code})
    assert r.status_code == 200 and r.json()["user"]["role"] == "manager"
    assert mgr.post("/team", json={"name": "Nope Nope", "email": "n@x.co", "role": "manager"}).status_code == 403  # not owner
    assert mgr.get("/audit").status_code == 200

    # unknown number gets the same answer, but no code
    anon = TestClient(app, headers=H)
    r = anon.post("/auth/otp/request", json={"target": "9000000001"})
    assert r.status_code == 200 and "dev_code" not in r.json()

    op = TestClient(app, headers=H)
    code = op.post("/auth/otp/request", json={"target": "op@example.com"}).json()["dev_code"]
    assert op.post("/auth/otp/verify", json={"target": "op@example.com", "code": code}).status_code == 200
    assert op.post("/plan/baseline", json={}).status_code == 403  # operators only view
    assert op.get("/schedules/current").status_code == 200


def test_upload_validation():
    c = TestClient(app, headers=H)
    signup(c, "up@example.com", "Shop C")
    assert upload(c, b"foo,bar\n1,2", "x.csv").status_code == 422
    bad = b"job_id,op_seq,eligible_machines,duration_min,due_at\nJ1,1,M1,abc,2026-01-01\nJ2,1,,10,2026-01-01\n"
    r = upload(c, bad)
    assert r.status_code == 422 and r.json()["detail"]["error_count"] == 2
    assert upload(c, b"x", "evil.xlsm").status_code == 422
    assert upload(c, b"not a zip", "fake.xlsx").status_code == 422
    r = c.post("/data/upload?dry_run=true", files={"file": ("a.csv", io.BytesIO(csv_bytes()), "text/csv")})
    assert r.status_code == 200 and r.json()["saved"] is False and r.json()["summary"]["jobs"] == 6


def test_full_flow_baseline_event_approve_and_tenant_isolation():
    c = TestClient(app, headers=H)
    signup(c, "flow@example.com", "Shop D")
    assert c.post("/plan/baseline", json={}).status_code == 409  # nothing uploaded
    r = upload(c)
    assert r.status_code == 200 and r.json()["saved"], r.text
    r = c.post("/plan/baseline", json={"time_limit": 2})
    assert r.status_code == 200, r.text
    base = r.json()
    assert base["status"] == "draft" and base["metrics"]["on_time_pct"] == 100.0
    assert c.post("/events", json={"event": {"type": "breakdown", "machine": "M2", "duration_min": 120}}).status_code == 409  # no published plan yet
    assert c.post(f"/schedules/{base['id']}/approve").status_code == 200
    cur = c.get("/schedules/current").json()
    assert cur["published"]["id"] == base["id"]

    p = c.post("/events/parse", json={"text": "M2 spindle overheat, down for 2 hours"}).json()
    assert p["event"]["type"] == "breakdown" and p["event"]["machine"] == "M2" and p["event"]["duration_min"] == 120
    r = c.post("/events", json={"event": p["event"], "raw_text": "x", "stability": 0.6, "freeze_min": 30, "at_min": 30})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["kind"] == "repair" and rep["status"] == "draft"
    # nothing on the broken machine during the outage window
    s, e = 30, 150
    for o in rep["ops"]:
        if o["machine"] == "M2" and o["state"] in ("planned",):
            assert o["end"] <= s or o["start"] >= e
    # done or running work never moved
    assert all(not o["moved"] for o in rep["ops"] if o["state"] in ("done", "running", "frozen"))
    again = c.post(f"/schedules/{rep['id']}/regenerate", json={"stability": 0.1}).json()
    assert again["id"] != rep["id"]
    assert c.post(f"/schedules/{rep['id']}/approve").status_code == 409  # already replaced
    assert c.post(f"/schedules/{again['id']}/approve").status_code == 200
    assert c.get("/schedules/current").json()["published"]["id"] == again["id"]

    # rush job becomes a real job once approved
    r = c.post("/events", json={"event": {"type": "rush", "job_id": "R1", "machine": "M2", "duration_min": 90}, "at_min": 40})
    assert r.status_code == 200, r.text
    assert any(o["job"] == "R1" and o["added"] for o in r.json()["ops"])
    c.post(f"/schedules/{r.json()['id']}/approve")
    assert any(j["code"] == "R1" for j in c.get("/data/jobs").json()["jobs"])

    # another shop cannot see any of it
    other = TestClient(app, headers=H)
    signup(other, "other@example.com", "Shop E")
    assert other.get(f"/schedules/{base['id']}").status_code == 404
    assert other.post(f"/schedules/{again['id']}/approve").status_code == 404
    assert other.get("/data/jobs").json()["jobs"] == []
    assert any(e["action"] == "plan.approved" for e in c.get("/audit").json()["entries"])


def test_material_event_and_unknown_machine():
    c = TestClient(app, headers=H)
    signup(c, "mat@example.com", "Shop F")
    upload(c)
    b = c.post("/plan/baseline", json={"time_limit": 2}).json()
    c.post(f"/schedules/{b['id']}/approve")
    assert c.post("/events", json={"event": {"type": "breakdown", "machine": "ZZ", "duration_min": 10}}).status_code == 422
    r = c.post("/events", json={"event": {"type": "material", "job_id": "J-3", "delay_min": 240}, "at_min": 0})
    assert r.status_code == 200, r.text
    first = min((o for o in r.json()["ops"] if o["job"] == "J-3"), key=lambda o: o["seq"])
    assert first["start"] >= 240


def test_pilot_public_form_and_admin():
    c = TestClient(app, headers=H)
    body = {"name": "Ravi", "role": "Owner", "shop": "Ravi Tools", "cluster": "Jeedimetla", "machines": "5–10", "tool": "Excel",
            "contact": "ravi@example.com", "pain": ["Rush orders"]}
    assert c.post("/pilot", json=body).status_code == 200
    assert c.post("/pilot", json=body).status_code == 200  # same person: updated, not duplicated
    assert c.post("/pilot", json={**body, "contact": "bad"}).status_code == 422
    assert c.post("/pilot", json={**body, "contact": "x@y.zz", "website": "http://spam"}).json() == {"ok": True}
    assert c.get("/admin/pilots").status_code == 401
    admin = TestClient(app, headers=H)
    signup(admin, "admin@example.com", "Admin Shop")
    pilots = admin.get("/admin/pilots").json()["pilots"]
    assert [p["contact"] for p in pilots].count("ravi@example.com") == 1
    assert not any(p["contact"] == "x@y.zz" for p in pilots)
    plain = TestClient(app, headers=H)
    signup(plain, "plain@example.com", "Plain")
    assert plain.get("/admin/pilots").status_code == 403
    assert c.post("/pilot/forget", json={"contact": "ravi@example.com"}).status_code == 200
    assert admin.get("/admin/pilots").json()["pilots"][0]["status"] in ("deletion_requested", "new")


def test_export_and_delete_shop():
    c = TestClient(app, headers=H)
    signup(c, "del@example.com", "Shop Del")
    upload(c)
    assert len(c.get("/me/export").json()["jobs"]) == 6
    assert c.post("/me/delete-shop", json={"confirm_name": "wrong"}).status_code == 422
    assert c.post("/me/delete-shop", json={"confirm_name": "Shop Del"}).status_code == 200
    assert c.get("/auth/me").status_code == 401


def test_password_reset_signs_out_everywhere():
    c = TestClient(app, headers=H)
    signup(c, "rst@example.com", "Shop R")
    code = c.post("/auth/password/forgot", json={"email": "rst@example.com"}).json()["dev_code"]
    r = c.post("/auth/password/reset", json={"email": "rst@example.com", "code": code, "new_password": "brand-new-pass-77"})
    assert r.status_code == 200
    assert c.get("/auth/me").status_code == 401  # old access token invalid after token_version bump
    assert c.post("/auth/login", json={"email": "rst@example.com", "password": "brand-new-pass-77"}).status_code == 200


def test_word_document_with_a_table_is_accepted(client):
    import io
    from docx import Document

    signup(client)
    d = Document()
    t = d.add_table(rows=3, cols=6)
    for i, h in enumerate(["Job", "Op", "Machines", "Minutes", "Due", "Priority"]):
        t.rows[0].cells[i].text = h
    rows = [["W-1", "1", "M1|M2", "90", "2030-01-02T16:00", "1"], ["W-1", "2", "M3", "45", "2030-01-02T16:00", "1"]]
    for r, row in enumerate(rows, 1):
        for i, v in enumerate(row):
            t.rows[r].cells[i].text = v
    buf = io.BytesIO()
    d.save(buf)
    r = client.post("/data/upload", files={"file": ("plan.docx", buf.getvalue(), "application/octet-stream")})
    assert r.status_code == 200, r.text
    assert r.json()["summary"]["jobs"] == 1 and r.json()["saved"] is True


def test_fake_docx_and_wrong_types_are_refused(client):
    signup(client, email="docx-check@example.com", shop="Docx Shop")
    assert client.post("/data/upload", files={"file": ("x.docx", b"not a zip", "application/octet-stream")}).status_code == 422
    assert client.post("/data/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 422
