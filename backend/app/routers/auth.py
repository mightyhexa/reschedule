from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .. import demo, notify
from ..config import get_settings
from ..db import get_db
from ..deps import ACCESS_COOKIE, OAUTH_PATH, PERMS, REFRESH_COOKIE, audit, clear_auth_cookies, current_user, set_auth_cookies
from ..models import OtpCode, RefreshToken, Shop, User
from ..ratelimit import client_ip, limit
from ..security import (hash_password, make_access_token, needs_rehash, new_otp, new_refresh_token, normalise_email,
                        normalise_phone, otp_expiry, otp_hash, password_problem, safe_equal, sha256, verify_password)

S = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])
GENERIC_FAIL = "Wrong email or password."


# ------------------------------------------------------------------ helpers
def _user_out(u: User) -> dict:
    return {
        "id": u.id, "name": u.name, "email": u.email, "phone": u.phone, "role": u.role,
        "email_verified": u.email_verified, "phone_verified": u.phone_verified,
        "perms": sorted(PERMS.get(u.role, set())),
        "demo": demo.is_demo(u),
        "is_admin": bool(u.email and u.email_verified and u.email.lower() in S.admin_emails),
        "shop": {"id": u.shop.id, "name": u.shop.name, "timezone": u.shop.timezone},
    }


def start_session(db: Session, request: Request, resp: Response, user: User, method: str, family: str | None = None) -> None:
    raw, h = new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, family=family or secrets.token_hex(8), token_hash=h, method=method,
        user_agent=(request.headers.get("user-agent") or "")[:200],
        expires_at=datetime.utcnow() + timedelta(days=S.refresh_ttl_days),
    ))
    user.last_login_at = datetime.utcnow()
    user.failed_logins, user.locked_until = 0, None
    set_auth_cookies(resp, make_access_token(user.id, user.shop_id, user.role, user.token_version), raw)


def _issue_otp(db: Session, target: str, purpose: str) -> str | None:
    """Create and send a code. Returns the code (so dev mode can echo it) or None if rate limited."""
    recent = db.scalar(select(func.count()).select_from(OtpCode).where(
        OtpCode.target == target, OtpCode.created_at > datetime.utcnow() - timedelta(minutes=10)))
    if (recent or 0) >= 4:
        return None
    for old in db.scalars(select(OtpCode).where(OtpCode.target == target, OtpCode.purpose == purpose, OtpCode.used_at.is_(None))):
        old.used_at = datetime.utcnow()  # only the newest code is valid
    code = new_otp()
    db.add(OtpCode(target=target, purpose=purpose, code_hash=otp_hash(target, code), expires_at=otp_expiry()))
    db.commit()
    notify.send_otp(target, code, purpose)
    return code


def _check_otp(db: Session, target: str, purpose: str, code: str) -> bool:
    row = db.scalar(select(OtpCode).where(
        OtpCode.target == target, OtpCode.purpose == purpose, OtpCode.used_at.is_(None),
        OtpCode.expires_at > datetime.utcnow()).order_by(OtpCode.created_at.desc()))
    if not row:
        return False
    row.attempts += 1
    if row.attempts > 5:
        row.used_at = datetime.utcnow()
        db.commit()
        return False
    ok = safe_equal(row.code_hash, otp_hash(target, code.strip()))
    if ok:
        row.used_at = datetime.utcnow()
    db.commit()
    return ok


def _target(raw: str) -> tuple[str, str]:
    """Return (kind, normalised) for an email or phone input."""
    raw = raw.strip()
    if "@" in raw:
        return "email", normalise_email(raw)
    p = normalise_phone(raw)
    if not p:
        raise HTTPException(422, "Enter a valid email or phone number")
    return "phone", p


def _find(db: Session, kind: str, value: str) -> User | None:
    col = User.email if kind == "email" else User.phone
    return db.scalar(select(User).where(col == value))


def _dev(code: str | None) -> dict:
    return {"dev_code": code} if (S.dev_echo_otp and code) else {}


# ------------------------------------------------------------------ public config
@router.get("/config")
def config() -> dict:
    return {
        "google": bool(S.google_client_id and S.google_client_secret),
        "whatsapp": notify.whatsapp_configured(),
        "email": notify.email_configured(),
        "dev_codes": S.dev_echo_otp,
        "turnstile_site_key": S.turnstile_site_key or None,
        "demo": S.demo_login,
    }


# ------------------------------------------------------------------ one-click judge workspace
@router.post("/demo")
def demo_login(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    """A fresh private sandbox shop with sample data, no email, password or code. Off in production unless DEMO_LOGIN=1."""
    if not S.demo_login:
        raise HTTPException(404, "Not found")
    limit(request, "demo", 12, 3600)
    limit(request, "demo-day", 60, 86400)
    demo.purge_old(db)
    tag = secrets.token_hex(5)
    shop = Shop(name="Demo CNC Shop", timezone=S.default_tz)
    user = User(shop=shop, name="Demo Judge", email=f"demo-{tag}{demo.DEMO_DOMAIN}", role="owner", email_verified=True, password_hash=None)
    db.add_all([shop, user])
    db.flush()
    demo.seed(db, shop, user)
    audit(db, request, "auth.demo", user)
    start_session(db, request, response, user, "demo")
    db.commit()
    return {"user": _user_out(user)}


# ------------------------------------------------------------------ email + password
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str
    shop_name: str = Field(min_length=2, max_length=160)
    phone: str | None = None


@router.post("/register")
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)) -> dict:
    limit(request, "register", 6, 3600)
    email = normalise_email(body.email)
    bad = password_problem(body.password, body.name, email.split("@")[0])
    if bad:
        raise HTTPException(422, bad)
    phone = None
    if body.phone:
        phone = normalise_phone(body.phone)
        if not phone:
            raise HTTPException(422, "Enter a valid phone number")
    if db.scalar(select(User).where(User.email == email)) or (phone and db.scalar(select(User).where(User.phone == phone))):
        raise HTTPException(409, "An account with that email or phone already exists. Try signing in.")
    shop = Shop(name=body.shop_name.strip(), timezone=S.default_tz)
    user = User(shop=shop, name=body.name.strip(), email=email, phone=phone, role="owner", password_hash=hash_password(body.password))
    db.add_all([shop, user])
    db.flush()
    audit(db, request, "auth.register", user)
    db.commit()
    code = _issue_otp(db, email, "verify")
    return {"ok": True, "needs_verification": True, **_dev(code)}


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


@router.post("/verify-email")
def verify_email(body: VerifyIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    email = normalise_email(body.email)
    limit(request, "verify", 10, 600, email)
    user = _find(db, "email", email)
    if not user or not _check_otp(db, email, "verify", body.code):
        raise HTTPException(400, "That code is wrong or has expired.")
    user.email_verified = True
    audit(db, request, "auth.email_verified", user)
    start_session(db, request, response, user, "password")
    db.commit()
    return {"user": _user_out(user)}


class ResendIn(BaseModel):
    email: EmailStr


@router.post("/resend-verification")
def resend(body: ResendIn, request: Request, db: Session = Depends(get_db)) -> dict:
    email = normalise_email(body.email)
    limit(request, "resend", 6, 600, email)
    user = _find(db, "email", email)
    code = _issue_otp(db, email, "verify") if user and not user.email_verified else None
    return {"ok": True, **_dev(code)}


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    email = normalise_email(body.email)
    limit(request, "login-ip", 20, 600)
    limit(request, "login-acct", 8, 600, email)
    user = _find(db, "email", email)
    if user and user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(429, "Too many wrong attempts. Try again in a few minutes.")
    ok = verify_password(body.password, user.password_hash if user else None)
    if not ok or not user or not user.is_active:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
                user.failed_logins = 0
            audit(db, request, "auth.login_failed", user)
            db.commit()
        raise HTTPException(401, GENERIC_FAIL)
    if not user.email_verified:
        code = _issue_otp(db, email, "verify")
        raise HTTPException(403, detail={"code": "email_unverified", "message": "Confirm your email to continue.", **_dev(code)})
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    start_session(db, request, response, user, "password")
    audit(db, request, "auth.login", user, method="password")
    db.commit()
    return {"user": _user_out(user)}


# ------------------------------------------------------------------ one-time codes (WhatsApp / email)
class OtpRequestIn(BaseModel):
    target: str = Field(min_length=5, max_length=254)


@router.post("/otp/request")
def otp_request(body: OtpRequestIn, request: Request, db: Session = Depends(get_db)) -> dict:
    limit(request, "otp-ip", 12, 600)
    kind, value = _target(body.target)
    limit(request, "otp-target", 4, 600, value)
    user = _find(db, kind, value)
    code = _issue_otp(db, value, "login") if user and user.is_active and not demo.is_demo(user) else None
    # Same answer whether or not the account exists, so nobody can probe for registered numbers.
    return {"ok": True, "channel": "whatsapp" if kind == "phone" else "email", **_dev(code)}


class OtpVerifyIn(BaseModel):
    target: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=6, max_length=6)


@router.post("/otp/verify")
def otp_verify(body: OtpVerifyIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    limit(request, "otp-verify", 20, 600)
    kind, value = _target(body.target)
    limit(request, "otp-verify-t", 10, 600, value)
    user = _find(db, kind, value)
    if not user or not user.is_active or not _check_otp(db, value, "login", body.code):
        raise HTTPException(400, "That code is wrong or has expired.")
    if kind == "phone":
        user.phone_verified = True
    else:
        user.email_verified = True
    start_session(db, request, response, user, "whatsapp" if kind == "phone" else "email_code")
    audit(db, request, "auth.login", user, method="otp_" + kind)
    db.commit()
    return {"user": _user_out(user)}


# ------------------------------------------------------------------ password reset
@router.post("/password/forgot")
def forgot(body: ResendIn, request: Request, db: Session = Depends(get_db)) -> dict:
    email = normalise_email(body.email)
    limit(request, "forgot", 6, 600, email)
    user = _find(db, "email", email)
    code = _issue_otp(db, email, "reset") if user and user.is_active and not demo.is_demo(user) else None
    return {"ok": True, **_dev(code)}


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str


@router.post("/password/reset")
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)) -> dict:
    email = normalise_email(body.email)
    limit(request, "reset", 10, 600, email)
    user = _find(db, "email", email)
    bad = password_problem(body.new_password, user.name if user else "", email.split("@")[0])
    if bad:
        raise HTTPException(422, bad)
    if not user or not _check_otp(db, email, "reset", body.code):
        raise HTTPException(400, "That code is wrong or has expired.")
    user.password_hash = hash_password(body.new_password)
    user.email_verified = True
    user.token_version += 1  # signs out every device
    for t in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        t.revoked_at = datetime.utcnow()
    audit(db, request, "auth.password_reset", user)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ session lifecycle
@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(401, "Not signed in")
    tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw)))
    if not tok:
        clear_auth_cookies(response)
        raise HTTPException(401, "Session expired")
    if tok.revoked_at is not None:
        # A used token came back: assume it was stolen and end the whole login chain.
        for t in db.scalars(select(RefreshToken).where(RefreshToken.family == tok.family, RefreshToken.revoked_at.is_(None))):
            t.revoked_at = datetime.utcnow()
        audit(db, request, "auth.refresh_reuse", None, user_id=tok.user_id)
        db.commit()
        clear_auth_cookies(response)
        raise HTTPException(401, "Session expired")
    user = db.get(User, tok.user_id)
    if tok.expires_at < datetime.utcnow() or not user or not user.is_active:
        clear_auth_cookies(response)
        raise HTTPException(401, "Session expired")
    tok.revoked_at = datetime.utcnow()
    start_session(db, request, response, user, tok.method, family=tok.family)
    db.commit()
    return {"user": _user_out(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw)))
        if tok and tok.revoked_at is None:
            tok.revoked_at = datetime.utcnow()
            db.commit()
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/logout-all")
def logout_all(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    user.token_version += 1
    for t in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        t.revoked_at = datetime.utcnow()
    audit(db, request, "auth.logout_all", user)
    db.commit()
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"user": _user_out(user)}


@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    cur = sha256(request.cookies.get(REFRESH_COOKIE) or "")
    rows = db.scalars(select(RefreshToken).where(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None),
        RefreshToken.expires_at > datetime.utcnow()).order_by(RefreshToken.last_used_at.desc())).all()
    return {"sessions": [{"id": r.id, "method": r.method, "user_agent": r.user_agent,
                          "created_at": r.created_at.isoformat() + "Z", "last_used_at": r.last_used_at.isoformat() + "Z",
                          "current": r.token_hash == cur} for r in rows]}


@router.delete("/sessions/{sid}")
def revoke_session(sid: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    t = db.get(RefreshToken, sid)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Not found")
    t.revoked_at = datetime.utcnow()
    audit(db, request, "auth.session_revoked", user)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ Google sign-in (OpenID Connect)
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
_jwks = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")


def _g_redirect_uri() -> str:
    return f"{S.api_public_url}/auth/google/callback"


@router.get("/google/start")
def google_start(request: Request):
    limit(request, "google", 30, 600)
    if not (S.google_client_id and S.google_client_secret):
        raise HTTPException(501, "Google sign-in is not configured")
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    url = GOOGLE_AUTH + "?" + urlencode({
        "client_id": S.google_client_id, "redirect_uri": _g_redirect_uri(), "response_type": "code",
        "scope": "openid email profile", "state": state, "nonce": nonce, "prompt": "select_account",
    })
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie("rs_oauth", f"{state}.{nonce}", max_age=600, httponly=True, secure=S.cookie_secure, samesite="lax", path=OAUTH_PATH)
    return resp


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)):
    back = S.public_app_url.rstrip("/")
    fail = RedirectResponse(f"{back}/#/login?error=google", status_code=302)
    saved = request.cookies.get("rs_oauth", "")
    if not code or "." not in saved:
        return fail
    s_state, nonce = saved.split(".", 1)
    if not safe_equal(s_state, state):
        return fail
    try:
        r = httpx.post(GOOGLE_TOKEN, data={
            "code": code, "client_id": S.google_client_id, "client_secret": S.google_client_secret,
            "redirect_uri": _g_redirect_uri(), "grant_type": "authorization_code"}, timeout=10)
        r.raise_for_status()
        idt = r.json()["id_token"]
        key = _jwks.get_signing_key_from_jwt(idt).key
        claims = jwt.decode(idt, key, algorithms=["RS256"], audience=S.google_client_id,
                            issuer=["https://accounts.google.com", "accounts.google.com"])
    except Exception:
        return fail
    if claims.get("nonce") != nonce or not claims.get("email_verified"):
        return fail
    email, sub = normalise_email(claims["email"]), claims["sub"]
    user = db.scalar(select(User).where(User.google_sub == sub)) or _find(db, "email", email)
    if user and not user.is_active:
        return fail
    if not user:
        shop = Shop(name=f"{claims.get('name') or email.split('@')[0]}'s shop", timezone=S.default_tz)
        user = User(shop=shop, name=claims.get("name") or email.split("@")[0], email=email, role="owner")
        db.add_all([shop, user])
        db.flush()
        audit(db, request, "auth.register", user, method="google")
    if not user.email_verified:
        # Pre-hijack defence: someone may have registered this address with a password of their own
        # before its real owner proved control of it. Proving it through Google voids that password
        # and every session created before now.
        user.password_hash = None
        user.token_version += 1
        for t in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
            t.revoked_at = datetime.utcnow()
    user.google_sub, user.email_verified = sub, True
    resp = RedirectResponse(f"{back}/#/app", status_code=302)
    start_session(db, request, resp, user, "google")
    audit(db, request, "auth.login", user, method="google")
    db.commit()
    resp.delete_cookie("rs_oauth", path=OAUTH_PATH)
    return resp
