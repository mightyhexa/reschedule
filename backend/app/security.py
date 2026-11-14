"""Password hashing, JWT access tokens, opaque refresh tokens, OTPs, field encryption."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.fernet import Fernet

from .config import get_settings

S = get_settings()
_ph = PasswordHasher()  # Argon2id
_DUMMY = _ph.hash("not-a-real-password-for-timing")
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(S.field_key_source.encode()).digest()))
COMMON = frozenset({"password", "password1", "123456789", "1234567890", "qwertyuiop", "iloveyou12", "reschedule"})


def password_problem(pw: str, *hints: str) -> str | None:
    if len(pw) < 10:
        return "Use at least 10 characters."
    if len(pw) > 128:
        return "Use at most 128 characters."
    if pw.lower() in COMMON or len(set(pw)) < 5:
        return "That password is too easy to guess."
    low = pw.lower()
    for h in hints:
        if h and len(h) >= 4 and h.lower() in low:
            return "Do not use your name or email in the password."
    return None


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str | None) -> bool:
    """Takes the same time whether or not the user exists (hashed=None)."""
    try:
        _ph.verify(hashed or _DUMMY, pw)
        return hashed is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _ph.check_needs_rehash(hashed)


def make_access_token(user_id: str, shop_id: str, role: str, token_version: int) -> str:
    n = int(time.time())
    payload = {"sub": user_id, "shop": shop_id, "role": role, "tv": token_version, "iat": n,
               "exp": n + S.access_ttl_min * 60, "typ": "access", "iss": "reschedule"}
    return jwt.encode(payload, S.secret_key, algorithm="HS256")


def read_access_token(token: str) -> dict | None:
    try:
        p = jwt.decode(token, S.secret_key, algorithms=["HS256"], issuer="reschedule")
        return p if p.get("typ") == "access" else None
    except jwt.PyJWTError:
        return None


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_refresh_token() -> tuple[str, str]:
    """(raw token for the cookie, its hash for the database)."""
    raw = secrets.token_urlsafe(48)
    return raw, sha256(raw)


def hmac_hex(value: str) -> str:
    return hmac.new(S.secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


def new_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def otp_hash(target: str, code: str) -> str:
    return hmac_hex(f"otp|{target}|{code}")


def otp_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=5)


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def encrypt(text: str) -> str:
    return _fernet.encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()


def normalise_email(v: str) -> str:
    return v.strip().lower()


def normalise_phone(v: str, default_cc: str = "91") -> str | None:
    """Return E.164 like +919876543210, or None if it does not look like a phone number."""
    d = re.sub(r"[^\d+]", "", v.strip())
    if d.startswith("00"):
        d = "+" + d[2:]
    if not d.startswith("+"):
        d = d.lstrip("0")
        if len(d) == 10:
            d = default_cc + d
        d = "+" + d
    return d if re.fullmatch(r"\+\d{10,15}", d) else None
