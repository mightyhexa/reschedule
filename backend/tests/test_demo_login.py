import pytest
from app import demo
from app.config import get_settings
from conftest import signup


def test_one_click_demo_gives_a_ready_workspace(client):
    assert client.get("/auth/config").json()["demo"] is True
    r = client.post("/auth/demo")
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["demo"] is True and u["role"] == "owner" and u["shop"]["name"] == "Demo CNC Shop"
    d = client.get("/data/jobs").json()
    assert len(d["jobs"]) == 12 and d["machines"] == ["M1", "M2", "M3", "M4", "M5"]
    cur = client.get("/schedules/current").json()
    assert cur["published"]["kind"] == "baseline"
    drafts = [s for s in client.get("/schedules").json()["schedules"] if s["status"] == "draft"]
    assert len(drafts) == 1 and drafts[0]["kind"] == "repair"
    full = client.get(f"/schedules/{drafts[0]['id']}").json()
    assert any(w["machine"] == "M3" and w["kind"] == "down" for w in full["windows"])
    assert client.post(f"/schedules/{drafts[0]['id']}/approve").status_code == 200      # the judge can approve it right away


def test_demo_workspaces_are_private_and_limited(client):
    a = client.post("/auth/demo").json()["user"]
    from fastapi.testclient import TestClient
    from app.main import app
    other = TestClient(app, headers={"X-Requested-With": "reschedule"})
    b = other.post("/auth/demo").json()["user"]
    assert a["shop"]["id"] != b["shop"]["id"]
    client.post("/events", json={"event": {"type": "power_cut", "duration_min": 30}})       # mutate A only
    assert len(other.get("/schedules").json()["schedules"]) == 2                           # B still has just its own two plans
    assert client.post("/team", json={"name": "X Y", "email": "x@y.com", "role": "planner"}).status_code == 403
    assert client.post("/auth/otp/request", json={"identifier": a["email"]}).status_code in (200, 422)


def test_demo_is_off_when_disabled(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_login", False)
    assert client.get("/auth/config").json()["demo"] is False
    assert client.post("/auth/demo").status_code == 404


def test_old_demo_shops_are_purged(client):
    from datetime import datetime, timedelta
    from app.db import SessionLocal
    from app.models import Shop, User
    from sqlalchemy import select
    client.post("/auth/demo")
    with SessionLocal() as db:
        sid = db.scalar(select(Shop.id).join(User, User.shop_id == Shop.id).where(User.email.like("%@demo.reschedule.local")))
        db.get(Shop, sid).created_at = datetime.utcnow() - timedelta(hours=30)
        db.commit()
    client.post("/auth/demo")        # purges on the way in
    with SessionLocal() as db:
        assert db.get(Shop, sid) is None
