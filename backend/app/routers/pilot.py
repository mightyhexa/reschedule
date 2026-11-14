from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import mailtpl, notify
from ..config import get_settings
from ..db import get_db
from ..deps import audit
from ..models import PilotRequest
from ..ratelimit import client_ip, limit
from ..security import encrypt, hmac_hex, normalise_email, normalise_phone

S = get_settings()
router = APIRouter(prefix="/pilot", tags=["pilot"])


class PilotIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=80)
    shop: str = Field(min_length=1, max_length=160)
    cluster: str = Field(default="", max_length=40)
    machines: str = Field(default="", max_length=20)
    tool: str = Field(default="", max_length=40)
    contact: str = Field(min_length=5, max_length=254)
    pain: list[str] = Field(default_factory=list, max_length=8)
    website: str = ""  # honeypot: real people leave it empty
    turnstile: str | None = None


def _canon(contact: str) -> tuple[str, str]:
    c = contact.strip()
    if "@" in c:
        if not (3 <= len(c) <= 254) or " " in c or "." not in c.split("@")[-1]:
            raise HTTPException(422, "Enter a valid email address")
        return "email", normalise_email(c)
    p = normalise_phone(c)
    if not p:
        raise HTTPException(422, "Enter a valid email or phone number")
    return "phone", p


def _turnstile_ok(token: str | None, ip: str) -> bool:
    if not S.turnstile_secret:
        return True
    if not token:
        return False
    try:
        r = httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                       data={"secret": S.turnstile_secret, "response": token, "remoteip": ip}, timeout=8)
        return bool(r.json().get("success"))
    except Exception:
        return False


@router.post("")
def create(body: PilotIn, request: Request, db: Session = Depends(get_db)) -> dict:
    limit(request, "pilot", 5, 3600)
    if body.website:  # bots fill every field
        return {"ok": True}
    if not _turnstile_ok(body.turnstile, client_ip(request)):
        raise HTTPException(400, "Could not verify you are human. Please retry.")
    _, canon = _canon(body.contact)
    h = hmac_hex("pilot|" + canon)
    existing = db.scalar(select(PilotRequest).where(PilotRequest.contact_hash == h))
    if existing:  # same person twice: update, do not duplicate
        existing.name, existing.shop, existing.role = body.name.strip(), body.shop.strip(), body.role.strip()
        existing.cluster, existing.machines, existing.tool, existing.pain = body.cluster, body.machines, body.tool, body.pain
        if existing.status == "deletion_requested":
            existing.status = "new"
        db.commit()
        return {"ok": True}
    row = PilotRequest(name=body.name.strip(), role=body.role.strip(), shop=body.shop.strip(), cluster=body.cluster,
                       machines=body.machines, tool=body.tool, pain=body.pain, contact_enc=encrypt(canon), contact_hash=h)
    db.add(row)
    audit(db, request, "pilot.created", None, shop_id=None, pilot=row.id)
    db.commit()
    msg = f"New ReSchedule pilot request: {row.name}, {row.shop} ({row.cluster}, {row.machines} machines)."
    if S.admin_notify_email:
        subj, html, text = mailtpl.pilot_admin_email(msg, S.public_app_url + "/#/app/admin")
        notify.send_email(S.admin_notify_email, subj, text, html)
    if S.admin_notify_phone:
        notify.send_whatsapp_template(S.admin_notify_phone, S.wa_notify_template, [msg, S.public_app_url + "/#/app/admin"], preview=msg)
    return {"ok": True}


class ForgetIn(BaseModel):
    contact: str = Field(min_length=5, max_length=254)


@router.post("/forget")
def forget(body: ForgetIn, request: Request, db: Session = Depends(get_db)) -> dict:
    """Public 'delete my request' button: flags the row for deletion. Same answer whether or not a row exists."""
    limit(request, "pilot-forget", 5, 3600)
    try:
        _, canon = _canon(body.contact)
        row = db.scalar(select(PilotRequest).where(PilotRequest.contact_hash == hmac_hex("pilot|" + canon)))
        if row:
            row.status = "deletion_requested"
            audit(db, request, "pilot.deletion_requested", None, shop_id=None, pilot=row.id)
            db.commit()
    except HTTPException:
        pass
    return {"ok": True}
