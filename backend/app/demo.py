"""One-click judge workspace: a private, pre-filled demo shop per visitor. Nothing here is shared between visitors."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import services
from .models import AuditLog, Event, Job, Machine, Operation, Shop, User

DEMO_DOMAIN = "@demo.reschedule.local"
KEEP_HOURS = 24

# code, part, due in hours from now, priority, family, operations [(machines, minutes)]
JOBS = [
    ("J-1001", "Gear shaft", 9, 1, "steel", [("M1|M2", 70), ("M3", 90), ("M5", 45)]),
    ("J-1002", "Flange", 7, 2, "alloy", [("M2", 60), ("M4", 50)]),
    ("J-1003", "Bush", 6, 2, "brass", [("M1", 40), ("M5", 35)]),
    ("J-1004", "Housing", 12, 2, "aluminium", [("M3|M4", 120), ("M4", 60)]),
    ("J-1005", "Pinion", 10, 1, "steel", [("M1|M2", 55), ("M3", 75), ("M5", 50)]),
    ("J-1006", "Bracket", 5, 3, "aluminium", [("M3|M4", 65)]),
    ("J-1007", "Spindle", 11, 1, "steel", [("M1", 100), ("M5", 60)]),
    ("J-1008", "Coupling", 8, 2, "alloy", [("M2", 45), ("M3", 55)]),
    ("J-1009", "Cam plate", 13, 3, "alloy", [("M4", 90), ("M5", 40)]),
    ("J-1010", "Sleeve", 9, 2, "brass", [("M1|M2", 50), ("M5", 30)]),
    ("J-1011", "Cover", 14, 3, "aluminium", [("M3", 80), ("M4", 40)]),
    ("J-1012", "Hub", 15, 2, "steel", [("M2", 85), ("M3|M4", 70), ("M5", 35)]),
]


def is_demo(user: User) -> bool:
    return bool(user.email and user.email.endswith(DEMO_DOMAIN))


def purge_old(db: Session) -> int:
    """Remove demo shops older than a day so the database never fills up with visitors' sandboxes."""
    cutoff = datetime.utcnow() - timedelta(hours=KEEP_HOURS)
    ids = [s.id for s in db.scalars(select(Shop).join(User, User.shop_id == Shop.id)
                                    .where(User.email.like(f"%{DEMO_DOMAIN}"), Shop.created_at < cutoff)).unique()]
    for sid in ids:
        db.execute(delete(AuditLog).where(AuditLog.shop_id == sid))
        db.delete(db.get(Shop, sid))
    return len(ids)


def seed(db: Session, shop: Shop, user: User) -> None:
    """12 jobs, 5 machines, an approved morning plan, and one waiting repair draft for a 4-hour M3 breakdown."""
    for m in ("M1", "M2", "M3", "M4", "M5"):
        db.add(Machine(shop_id=shop.id, code=m))
    now = services.local_now(shop)
    for code, _part, due_h, prio, fam, ops in JOBS:
        job = Job(shop_id=shop.id, code=code, due_at=now + timedelta(hours=due_h), priority=prio, family=fam)
        for i, (ms, mins) in enumerate(ops, 1):
            job.ops.append(Operation(seq=i, eligible=ms.split("|"), duration_min=mins))
        db.add(job)
    db.flush()
    base = services.create_baseline(db, shop, user, 1.5, None)
    base.status, base.decided_by, base.decided_at, base.decision_note = "published", user.id, datetime.utcnow(), "Morning plan (demo)"
    jobs, _, machines, _ = services.load_problem(db, shop, now)
    payload = services.validate_event({"type": "breakdown", "machine": "M3", "duration_min": 240}, machines, [j.id for j in jobs])
    ev = Event(shop_id=shop.id, created_by=user.id, type="breakdown", payload=payload, raw_text="M3 spindle overheating, down for 4 hours")
    db.add(ev)
    db.flush()
    services.create_repair(db, shop, user, ev, base, stability=0.6, freeze_min=60, time_limit=1.5, at_min=60)
