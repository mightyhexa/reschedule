from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuditLog, User
from .ratelimit import client_ip
from .security import read_access_token

S = get_settings()
ACCESS_COOKIE, REFRESH_COOKIE = "rs_access", "rs_refresh"
REFRESH_PATH = f"{S.cookie_path_prefix}/auth"          # only sent to the auth routes
OAUTH_PATH = f"{S.cookie_path_prefix}/auth/google"

# What each role may do. Enforced on the server for every route.
PERMS = {
    "owner": {"view", "plan", "approve", "team", "shop"},
    "manager": {"view", "plan", "approve"},
    "planner": {"view", "plan"},
    "operator": {"view"},
}


def set_auth_cookies(resp: Response, access: str, refresh: str) -> None:
    kw = dict(httponly=True, secure=S.cookie_secure, samesite="lax", domain=S.cookie_domain)
    resp.set_cookie(ACCESS_COOKIE, access, max_age=S.access_ttl_min * 60, path="/", **kw)
    resp.set_cookie(REFRESH_COOKIE, refresh, max_age=S.refresh_ttl_days * 86400, path=REFRESH_PATH, **kw)


def clear_auth_cookies(resp: Response) -> None:
    resp.delete_cookie(ACCESS_COOKIE, path="/", domain=S.cookie_domain)
    resp.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH, domain=S.cookie_domain)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    p = read_access_token(token) if token else None
    if not p:
        raise HTTPException(401, "Not signed in")
    user = db.get(User, p["sub"])
    if not user or not user.is_active or user.token_version != p["tv"]:
        raise HTTPException(401, "Session expired")
    return user


def need(perm: str):
    def dep(user: User = Depends(current_user)) -> User:
        if perm not in PERMS.get(user.role, set()):
            raise HTTPException(403, "Your role cannot do this")
        return user

    return dep


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.email or user.email.lower() not in S.admin_emails or not user.email_verified:
        raise HTTPException(403, "Admins only")
    return user


def audit(db: Session, request: Request | None, action: str, user: User | None = None, shop_id: str | None = None, **detail) -> None:
    db.add(AuditLog(
        shop_id=shop_id or (user.shop_id if user else None),
        user_id=user.id if user else None,
        action=action,
        detail=detail,
        ip=client_ip(request) if request else "",
    ))
