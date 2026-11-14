"""In-memory sliding-window limiter. Fine for one process; use Redis when you run several."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from .config import get_settings

_lock = threading.Lock()
_hits: dict = defaultdict(deque)


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy:  # only behind your own proxy (nginx / Cloudflare), which overwrites the header
        xff = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hit(key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


def limit(request: Request, scope: str, limit_n: int, window_s: int, extra: str = "") -> None:
    if not hit(f"{scope}|{client_ip(request)}|{extra}", limit_n, window_s):
        raise HTTPException(429, "Too many attempts. Please wait a bit and try again.")


def reset() -> None:
    with _lock:
        _hits.clear()
