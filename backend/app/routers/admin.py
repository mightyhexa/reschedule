from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import admin_user, audit
from ..models import PilotRequest, User
from ..security import decrypt

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/pilots")
def pilots(_: User = Depends(admin_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(PilotRequest).order_by(PilotRequest.created_at.desc()).limit(500)).all()
    return {"pilots": [{"id": r.id, "name": r.name, "role": r.role, "shop": r.shop, "cluster": r.cluster, "machines": r.machines,
                        "tool": r.tool, "pain": r.pain, "contact": decrypt(r.contact_enc), "status": r.status,
                        "created_at": r.created_at.isoformat() + "Z"} for r in rows]}


class StatusIn(BaseModel):
    status: str


@router.patch("/pilots/{pid}")
def set_status(pid: str, body: StatusIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)) -> dict:
    if body.status not in ("new", "contacted", "pilot", "declined"):
        raise HTTPException(422, "Unknown status")
    r = db.get(PilotRequest, pid)
    if not r:
        raise HTTPException(404, "Not found")
    r.status = body.status
    audit(db, request, "admin.pilot_status", user, pilot=pid, status=body.status)
    db.commit()
    return {"ok": True}


@router.delete("/pilots/{pid}")
def delete_pilot(pid: str, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)) -> dict:
    r = db.get(PilotRequest, pid)
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r)
    audit(db, request, "admin.pilot_deleted", user, pilot=pid)
    db.commit()
    return {"ok": True}
