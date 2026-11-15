from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import notify
from .config import get_settings
from .db import Base, engine
from .routers import admin, assistant, auth, pilot, shop, voice

S = get_settings()
logging.basicConfig(level=logging.INFO)
Base.metadata.create_all(engine)  # first run; use Alembic migrations once the schema is in production

app = FastAPI(title="ReSchedule API", version="0.2.0", docs_url=None if S.is_prod else "/docs", redoc_url=None, openapi_url=None if S.is_prod else "/openapi.json")

app.add_middleware(CORSMiddleware, allow_origins=S.allowed_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-Requested-With"], max_age=600)

MAX_BODY = (S.max_upload_mb + 1) * 1024 * 1024
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def guard(request: Request, call_next):
    # CSRF: cookies are SameSite=Lax, and every state-changing call must also carry a header
    # that a cross-site form cannot set. Origin, when present, must be on the allowlist.
    if request.method in UNSAFE:
        if request.headers.get("x-requested-with") != "reschedule":
            return JSONResponse({"detail": "Missing request header"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in S.allowed_origins:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        if int(request.headers.get("content-length") or 0) > MAX_BODY:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
    resp = await call_next(request)
    resp.headers.update({
        "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    })
    if S.is_prod:
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return resp


@app.get("/health")
def health() -> dict:
    return {"ok": True, "env": S.env}


app.include_router(auth.router)
app.include_router(pilot.router)
app.include_router(shop.router)
app.include_router(admin.router)
app.include_router(assistant.router)
app.include_router(voice.router)

if not S.is_prod:
    @app.get("/dev/outbox", include_in_schema=False)
    def outbox() -> list:
        """Dev only: the WhatsApp/email messages that would have been sent."""
        return list(notify.OUTBOX)
