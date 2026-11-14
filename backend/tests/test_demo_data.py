"""The shipped demo files must import, plan and repair through the real API."""
from pathlib import Path

import pytest

from conftest import signup

DEMO = Path(__file__).resolve().parent.parent.parent / "demo_data"
GOOD = ["01_quick_demo.csv", "02_shop_week.xlsx", "03_planner_notes.docx", "05_stress_test.xlsx"]


@pytest.mark.parametrize("name", GOOD)
def test_demo_file_imports_plans_and_repairs(client, name):
    signup(client, email=f"{name[:2]}@example.com", shop=name)
    f = DEMO / name
    r = client.post("/data/upload", files={"file": (name, f.read_bytes())})
    assert r.status_code == 200, r.text
    assert r.json()["saved"] and r.json()["summary"]["operations"] > 15
    base = client.post("/plan/baseline", json={"time_limit": 3})
    assert base.status_code == 200, base.text
    b = base.json()
    assert client.post(f"/schedules/{b['id']}/approve").status_code == 200
    p = client.post("/events/parse", json={"text": "Lathe-2 broke down for 3 hours"}).json()
    assert p["confident"], p
    rep = client.post("/events", json={"event": p["event"], "raw_text": "x", "stability": 0.6, "freeze_min": 30, "at_min": 30})
    assert rep.status_code == 200, rep.text
    assert rep.json()["metrics"]


def test_messy_file_shows_row_errors_and_saves_nothing(client):
    signup(client, email="messy@example.com", shop="messy")
    r = client.post("/data/upload", files={"file": ("04_messy_with_errors.csv", (DEMO / "04_messy_with_errors.csv").read_bytes())})
    assert r.status_code == 422
    d = r.json()["detail"]
    assert d["error_count"] == 5 and all("row" in e for e in d["errors"])
    assert client.get("/data/jobs").json()["jobs"] == []
